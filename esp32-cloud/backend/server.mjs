import http from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import pg from 'pg';
import { sha256, newCode, isDeviceId, isCode, isBoard, publicDevice,
  equalHash, manifestFor, allowedOrigin } from './lib.mjs';

const PORT = Number(process.env.PORT || 3000);
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || '';
const DATABASE_URL = process.env.DATABASE_URL || '';
const FIRMWARE = {
  version: process.env.FIRMWARE_VERSION || '',
  url: process.env.FIRMWARE_URL || '',
  sha256: process.env.FIRMWARE_SHA256 || '',
  board: process.env.FIRMWARE_BOARD || ''
};
if (!GOOGLE_CLIENT_ID || !DATABASE_URL || !ALLOWED_ORIGINS) {
  console.error('Missing GOOGLE_CLIENT_ID, DATABASE_URL or ALLOWED_ORIGINS');
  process.exit(1);
}
const oauth = new OAuth2Client(GOOGLE_CLIENT_ID);
const db = new pg.Pool({
  connectionString: DATABASE_URL,
  max: 10, idleTimeoutMillis: 30000,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: true } : undefined
});

async function init() {
  await db.query(`CREATE TABLE IF NOT EXISTS cloud_devices (
    id UUID PRIMARY KEY, owner_sub TEXT NOT NULL, name TEXT NOT NULL,
    board TEXT NOT NULL, secret_hash CHAR(64) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    firmware_version TEXT NOT NULL DEFAULT '',
    last_seen TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS cloud_pair_codes (
    code_hash CHAR(64) PRIMARY KEY,
    device_id UUID NOT NULL REFERENCES cloud_devices(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS cloud_pair_attempts (
    user_sub TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await db.query('CREATE INDEX IF NOT EXISTS cloud_devices_owner ON cloud_devices(owner_sub)');
  await db.query('CREATE INDEX IF NOT EXISTS cloud_pair_attempts_user_time ON cloud_pair_attempts(user_sub, created_at)');
}
const send = (res, status, obj, extras={}) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    ...extras
  });
  res.end(JSON.stringify(obj));
};
class ApiError extends Error { constructor(status, message) { super(message); this.status=status; } }
async function body(req) {
  let data = '', bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 8192) throw new ApiError(413, 'Dữ liệu quá lớn');
    data += chunk.toString('utf8');
  }
  try { return JSON.parse(data || '{}'); }
  catch { throw new ApiError(400, 'JSON không hợp lệ'); }
}
async function googleUser(req) {
  const token = (req.headers.authorization || '').match(/^Bearer (\S+)$/)?.[1];
  if (!token) throw new ApiError(401, 'Vui lòng đăng nhập Google');
  try {
    const ticket = await oauth.verifyIdToken({idToken:token, audience:GOOGLE_CLIENT_ID});
    const p = ticket.getPayload();
    if (!p || !p.sub || p.email_verified !== true ||
        !['accounts.google.com', 'https://accounts.google.com'].includes(p.iss))
      throw Error('Unverified identity');
    return { sub: p.sub, name: p.name || 'Người dùng', email: p.email,
      picture: p.picture || '' };
  } catch { throw new ApiError(401, 'Phiên Google hết hạn hoặc không hợp lệ'); }
}
async function deviceAuth(req) {
  const id = req.headers['x-device-id'];
  const secret = req.headers['x-device-key'];
  if (!isDeviceId(id) || typeof secret !== 'string' || secret.length > 256)
    throw new ApiError(401, 'Thiếu thông tin xác thực thiết bị');
  const { rows } = await db.query('SELECT * FROM cloud_devices WHERE id=$1', [id]);
  if (!rows[0] || !equalHash(secret, rows[0].secret_hash))
    throw new ApiError(401, 'Thiết bị chưa được cấp phép');
  return rows[0];
}
function pathInfo(req) {
  const u = new URL(req.url, 'http://localhost');
  return { path: u.pathname, params: u.searchParams };
}
async function handler(req, res) {
  const origin = req.headers.origin;
  const cors = allowedOrigin(origin, ALLOWED_ORIGINS);
  const headers = cors ? {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Device-Id, X-Device-Key',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin'
  } : { 'Vary': 'Origin' };
  const answer=(status,obj)=>send(res,status,obj,headers);
  try {
    if (origin && !cors) throw new ApiError(403, 'Origin không được cho phép');
    if (req.method === 'OPTIONS') { res.writeHead(204,headers); res.end(); return; }
    const {path,params} = pathInfo(req);
    if (req.method === 'GET' && path === '/api/health') {
      await db.query('SELECT 1');
      return answer(200,{status:'ok',service:'trinhduyet-esp32-cloud',version:'0.1.0'});
    }
    if (req.method === 'GET' && path === '/api/me') {
      const u=await googleUser(req);
      return answer(200,{user:u});
    }
    if (req.method === 'GET' && path === '/api/devices') {
      const u=await googleUser(req);
      const r=await db.query('SELECT * FROM cloud_devices WHERE owner_sub=$1 ORDER BY created_at DESC',[u.sub]);
      return answer(200,{devices:r.rows.map(publicDevice)});
    }
    if (req.method === 'POST' && path === '/api/devices') {
      const u=await googleUser(req), v=await body(req);
      const name=typeof v.name === 'string' ? v.name.trim() : '';
      if (name.length<2 || name.length>60 || !isBoard(v.board))
        throw new ApiError(400,'Tên thiết bị hoặc loại bo mạch không hợp lệ');
      const count=await db.query('SELECT COUNT(*)::int AS n FROM cloud_devices WHERE owner_sub=$1',[u.sub]);
      if (count.rows[0].n>=20) throw new ApiError(429,'Giới hạn 20 thiết bị mỗi tài khoản');
      const id=randomUUID(), deviceKey=randomBytes(32).toString('hex');
      await db.query('INSERT INTO cloud_devices(id,owner_sub,name,board,secret_hash) VALUES($1,$2,$3,$4,$5)',
        [id,u.sub,name,v.board,sha256(deviceKey)]);
      return answer(201,{device:{id,name,board:v.board,status:'pending'},deviceKey,
        note:'Khóa chỉ hiển thị một lần. Nạp vào ESP32 qua kênh an toàn; không đăng lên GitHub.'});
    }
    if (req.method === 'POST' && path === '/api/devices/claim') {
      const u=await googleUser(req),v=await body(req);
      if (!isCode(v.code)) throw new ApiError(400,'Mã phải gồm đúng 6 chữ số');
      // Database-backed attempt limit; survives application restarts.
      const count=await db.query(
        "SELECT COUNT(*)::int AS n FROM cloud_pair_attempts WHERE user_sub=$1 AND created_at>now()-interval '5 minutes'",[u.sub]);
      if (count.rows[0].n>=10) throw new ApiError(429,'Thử lại sau 5 phút');
      await db.query('INSERT INTO cloud_pair_attempts(user_sub) VALUES($1)',[u.sub]);
      const client=await db.connect();
      try {
        await client.query('BEGIN');
        const r=await client.query(
          'SELECT c.device_id,d.owner_sub,d.status FROM cloud_pair_codes c JOIN cloud_devices d ON d.id=c.device_id WHERE c.code_hash=$1 AND c.expires_at>now() FOR UPDATE OF c',
          [sha256(v.code)]);
        if (!r.rows[0]) throw new ApiError(400,'Mã không đúng hoặc đã hết hạn');
        if (r.rows[0].owner_sub !== u.sub)
          throw new ApiError(403,'Mã không thuộc thiết bị của tài khoản này');
        await client.query("UPDATE cloud_devices SET status='active' WHERE id=$1",[r.rows[0].device_id]);
        await client.query('DELETE FROM cloud_pair_codes WHERE device_id=$1',[r.rows[0].device_id]);
        await client.query('COMMIT');
        return answer(200,{paired:true,deviceId:r.rows[0].device_id});
      } catch (e) {await client.query('ROLLBACK');throw e;}
      finally {client.release();}
    }
    if (path.startsWith('/api/device/')) {
      const d=await deviceAuth(req);
      if (req.method==='POST' && path==='/api/device/pair/request') {
        if (d.status==='active') return answer(200,{paired:true});
        const fresh=await db.query(
          "SELECT 1 FROM cloud_pair_codes WHERE device_id=$1 AND created_at>now()-interval '30 seconds'",[d.id]);
        if (fresh.rowCount) throw new ApiError(429,'Chỉ cấp mã mới sau 30 giây');
        await db.query('DELETE FROM cloud_pair_codes WHERE device_id=$1',[d.id]);
        for (let tries=0;tries<5;tries++) {
          const code=newCode();
          try {
            await db.query("INSERT INTO cloud_pair_codes(code_hash,device_id,expires_at) VALUES($1,$2,now()+interval '5 minutes')",[sha256(code),d.id]);
            return answer(200,{paired:false,code,expiresIn:300});
          } catch(e) {if (e.code!=='23505') throw e;}
        }
        throw new ApiError(503,'Không thể cấp mã lúc này');
      }
      if (req.method==='GET' && path==='/api/device/pair/status') {
        return answer(200,{paired:d.status==='active',status:d.status});
      }
      if (req.method==='POST' && path==='/api/device/heartbeat') {
        const v=await body(req);
        const version=typeof v.firmwareVersion==='string' ? v.firmwareVersion.trim().slice(0,64) : '';
        await db.query('UPDATE cloud_devices SET last_seen=now(),firmware_version=$2 WHERE id=$1',[d.id,version]);
        return answer(200,{ok:true});
      }
      if (req.method==='GET' && path==='/api/device/ota') {
        if (d.status!=='active') throw new ApiError(403,'Thiết bị chưa kích hoạt');
        return answer(200,manifestFor(d,FIRMWARE));
      }
    }
    throw new ApiError(404,'Không tìm thấy API');
  } catch(e) {
    if (!(e instanceof ApiError)) console.error('API error', e);
    const status=e instanceof ApiError?e.status:500;
    if (!res.headersSent) answer(status,{error:status===500?'Lỗi máy chủ':e.message});
  }
}
init().then(()=>{
  http.createServer(handler).listen(PORT,'0.0.0.0',()=>console.log('ESP32 Cloud listening on '+PORT));
}).catch(e=>{console.error('Database initialization failed',e);process.exit(1)});
