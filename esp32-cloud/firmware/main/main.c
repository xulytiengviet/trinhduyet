/* ESP-IDF ESP32 Cloud reference firmware; see firmware/README.md before production. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include <stdbool.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/event_groups.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_wifi.h"
#include "esp_netif.h"
#include "nvs_flash.h"
#include "esp_http_client.h"
#include "esp_https_ota.h"
#include "esp_crt_bundle.h"
#include "esp_ota_ops.h"
#include "esp_partition.h"
#include "esp_system.h"
#include "mbedtls/sha256.h"
#include "cJSON.h"

static const char *TAG = "TD_ESP32_CLOUD";
static EventGroupHandle_t wifi_group;
#define WIFI_READY_BIT BIT0
#define RESP_CAP 2048

typedef struct { char text[RESP_CAP]; size_t length; } http_reply_t;
static esp_err_t on_http(esp_http_client_event_t *event) {
    if (event->event_id == HTTP_EVENT_ON_DATA && event->user_data) {
        http_reply_t *r = (http_reply_t*)event->user_data;
        if (event->data_len <= 0 || r->length >= RESP_CAP-1) return ESP_OK;
        size_t n = (size_t)event->data_len;
        if (n > RESP_CAP-1-r->length) n=RESP_CAP-1-r->length;
        memcpy(r->text+r->length,event->data,n);
        r->length+=n; r->text[r->length]=0;
    }
    return ESP_OK;
}
static void wifi_event(void *arg, esp_event_base_t base, int32_t id, void *data) {
    if (base==WIFI_EVENT && id==WIFI_EVENT_STA_START) esp_wifi_connect();
    else if (base==WIFI_EVENT && id==WIFI_EVENT_STA_DISCONNECTED) {
        xEventGroupClearBits(wifi_group,WIFI_READY_BIT);
        esp_wifi_connect();
    } else if (base==IP_EVENT && id==IP_EVENT_STA_GOT_IP)
        xEventGroupSetBits(wifi_group,WIFI_READY_BIT);
}
static void connect_wifi(void) {
    wifi_group=xEventGroupCreate();
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();
    wifi_init_config_t init=WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&init));
    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT,ESP_EVENT_ANY_ID,&wifi_event,NULL));
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT,IP_EVENT_STA_GOT_IP,&wifi_event,NULL));
    wifi_config_t config={0};
    snprintf((char*)config.sta.ssid,sizeof(config.sta.ssid),"%s",CONFIG_ESP32_CLOUD_WIFI_SSID);
    snprintf((char*)config.sta.password,sizeof(config.sta.password),"%s",CONFIG_ESP32_CLOUD_WIFI_PASSWORD);
    config.sta.threshold.authmode=WIFI_AUTH_WPA2_PSK;
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA,&config));
    ESP_ERROR_CHECK(esp_wifi_start());
}
static cJSON *api_call(const char *path, const char *method, const char *body) {
    if (!(xEventGroupGetBits(wifi_group)&WIFI_READY_BIT)) return NULL;
    char url[350];
    if (snprintf(url,sizeof(url),"%s%s",CONFIG_ESP32_CLOUD_API_URL,path)>=(int)sizeof(url)) return NULL;
    http_reply_t r={0};
    esp_http_client_config_t cfg={
        .url=url,.event_handler=on_http,.user_data=&r,
        .crt_bundle_attach=esp_crt_bundle_attach,.timeout_ms=15000
    };
    esp_http_client_handle_t client=esp_http_client_init(&cfg);
    if(!client) return NULL;
    esp_http_client_set_header(client,"X-Device-Id",CONFIG_ESP32_CLOUD_DEVICE_ID);
    esp_http_client_set_header(client,"X-Device-Key",CONFIG_ESP32_CLOUD_DEVICE_KEY);
    esp_http_client_set_header(client,"Content-Type","application/json");
    if(strcmp(method,"POST")==0) {
        esp_http_client_set_method(client,HTTP_METHOD_POST);
        esp_http_client_set_post_field(client,body?body:"{}",body?strlen(body):2);
    }
    esp_err_t err=esp_http_client_perform(client);
    int status=esp_http_client_get_status_code(client);
    esp_http_client_cleanup(client);
    if(err!=ESP_OK || status<200 || status>=300) {
        ESP_LOGW(TAG,"API %s: request failed (HTTP %d)",path,status);
        return NULL;
    }
    return cJSON_Parse(r.text);
}
static bool bool_field(cJSON *obj,const char *name) {
    return cJSON_IsTrue(cJSON_GetObjectItemCaseSensitive(obj,name));
}
static const char *string_field(cJSON *obj,const char *name) {
    cJSON *v=cJSON_GetObjectItemCaseSensitive(obj,name);
    return cJSON_IsString(v) && v->valuestring ? v->valuestring : NULL;
}
static bool parse_sha256(const char *hex,unsigned char out[32]) {
    if(!hex || strlen(hex)!=64) return false;
    for(int i=0;i<32;i++) {
        unsigned int byte;
        if(sscanf(hex+2*i,"%2x",&byte)!=1) return false;
        out[i]=(unsigned char)byte;
    }
    return true;
}
static bool sha256_partition(const esp_partition_t *partition,size_t length,unsigned char out[32]) {
    mbedtls_sha256_context hash; mbedtls_sha256_init(&hash);
    if(mbedtls_sha256_starts(&hash,0)!=0) {mbedtls_sha256_free(&hash);return false;}
    unsigned char chunk[1024];
    for(size_t off=0;off<length;off+=sizeof(chunk)) {
        size_t n=length-off<sizeof(chunk)?length-off:sizeof(chunk);
        if(esp_partition_read(partition,off,chunk,n)!=ESP_OK ||
           mbedtls_sha256_update(&hash,chunk,n)!=0) {mbedtls_sha256_free(&hash);return false;}
    }
    int ok=mbedtls_sha256_finish(&hash,out);
    mbedtls_sha256_free(&hash);
    return ok==0;
}
static void maybe_upgrade(cJSON *manifest) {
    if(!bool_field(manifest,"updateAvailable")) return;
    const char *board=string_field(manifest,"board");
    const char *version=string_field(manifest,"version");
    const char *url=string_field(manifest,"url");
    const char *sha=string_field(manifest,"sha256");
    unsigned char wanted[32],actual[32];
    if(!board || strcmp(board,CONFIG_ESP32_CLOUD_BOARD)!=0 ||
       !version || !url || strncmp(url,"https://",8)!=0 || !parse_sha256(sha,wanted)) {
        ESP_LOGE(TAG,"OTA manifest invalid");return;
    }
#if !defined(CONFIG_SECURE_BOOT) && !defined(CONFIG_SECURE_SIGNED_APPS_NO_SECURE_BOOT)
    ESP_LOGW(TAG,"OTA available (%s), but unsigned firmware update disabled. Enable verified app signing.",version);
    return;
#else
    const esp_partition_t *target=esp_ota_get_next_update_partition(NULL);
    if(!target){ESP_LOGE(TAG,"No OTA partition available");return;}
    esp_http_client_config_t http_cfg={.url=url,.crt_bundle_attach=esp_crt_bundle_attach,.timeout_ms=30000};
    esp_https_ota_config_t ota_cfg={.http_config=&http_cfg};
    esp_https_ota_handle_t handle=NULL;
    if(esp_https_ota_begin(&ota_cfg,&handle)!=ESP_OK){ESP_LOGE(TAG,"OTA begin failed");return;}
    esp_err_t err;
    while((err=esp_https_ota_perform(handle))==ESP_ERR_HTTPS_OTA_IN_PROGRESS) {
        vTaskDelay(pdMS_TO_TICKS(20));
    }
    bool ok=err==ESP_OK && esp_https_ota_is_complete_data_received(handle);
    size_t received=(size_t)esp_https_ota_get_image_len_read(handle);
    if(ok) ok=received>0 && received<=target->size && sha256_partition(target,received,actual) &&
              memcmp(wanted,actual,32)==0;
    if(!ok){ESP_LOGE(TAG,"OTA download incomplete or SHA-256 mismatch");esp_https_ota_abort(handle);return;}
    err=esp_https_ota_finish(handle);
    if(err==ESP_OK) {
        ESP_LOGI(TAG,"Verified signed OTA %s installed; reboot",version);
        esp_restart();
    } else ESP_LOGE(TAG,"OTA finish/signature verification failed");
#endif
}
static void cloud_task(void *arg) {
    while (!(xEventGroupGetBits(wifi_group)&WIFI_READY_BIT)) vTaskDelay(pdMS_TO_TICKS(500));
    ESP_LOGI(TAG,"WiFi connected; connecting securely to Render...");
    bool activated=false;
    cJSON *response=api_call("/api/device/pair/status","GET",NULL);
    if(response) {activated=bool_field(response,"paired"); cJSON_Delete(response);}
    while(!activated) {
        response=api_call("/api/device/pair/request","POST","{}");
        if(response) {
            if(bool_field(response,"paired")) activated=true;
            const char *code=string_field(response,"code");
            if(code) ESP_LOGW(TAG,"PAIRING CODE: %s (5 min). Enter in Google dashboard.",code);
            cJSON_Delete(response);
        }
        for(int i=0;i<60&&!activated;i++) {
            vTaskDelay(pdMS_TO_TICKS(5000));
            response=api_call("/api/device/pair/status","GET",NULL);
            if(response){activated=bool_field(response,"paired");cJSON_Delete(response);}
        }
    }
    ESP_LOGI(TAG,"Device activated");
    int ticks=0;
    while(1) {
        char payload[128];
        snprintf(payload,sizeof(payload),"{\"firmwareVersion\":\"%s\"}",CONFIG_ESP32_CLOUD_VERSION);
        response=api_call("/api/device/heartbeat","POST",payload);
        if(response)cJSON_Delete(response);
        if(ticks%5==0) {
            response=api_call("/api/device/ota","GET",NULL);
            if(response) {maybe_upgrade(response);cJSON_Delete(response);}
        }
        ticks++;
        vTaskDelay(pdMS_TO_TICKS(60000));
    }
}
void app_main(void) {
    ESP_ERROR_CHECK(nvs_flash_init());
    if(strncmp(CONFIG_ESP32_CLOUD_API_URL,"https://",8)!=0 ||
       !strlen(CONFIG_ESP32_CLOUD_DEVICE_ID) ||
       strlen(CONFIG_ESP32_CLOUD_DEVICE_KEY)!=64 ||
       !strlen(CONFIG_ESP32_CLOUD_WIFI_SSID)) {
        ESP_LOGE(TAG,"Invalid provisioning config: set HTTPS URL, UUID, device key and WiFi via menuconfig");
        return;
    }
    connect_wifi();
    xTaskCreate(cloud_task,"cloud_task",12288,NULL,5,NULL);
}
