<?php
// КАРАВАН relay v2 — лёгкий режим (защита от Entry Process limit)
// 1) curl таймаут 8с вместо 25с  2) кэш GET-ответов 3с (все устройства опрашивают одни и те же ключи)
header('Access-Control-Allow-Origin: *');
if (isset($_GET['ping'])) { header('Content-Type: application/json'); echo json_encode(array('ok'=>true,'php'=>PHP_VERSION,'curl'=>function_exists('curl_init'))); exit; }
$u = isset($_GET['u']) ? $_GET['u'] : '';
if (strpos($u, 'https://') !== 0 || strpos($u, 'firebaseio.com') === false) { http_response_code(400); header('Content-Type: application/json'); echo '{"error":"bad url"}'; exit; }
$method = 'GET';
if ($_SERVER['REQUEST_METHOD'] === 'POST') { $method = isset($_GET['m']) ? $_GET['m'] : 'PUT'; }
if (!in_array($method, array('GET','PUT','POST','DELETE','PATCH'))) $method = 'GET';

// кэш только для GET — 3 секунды, в системной tmp
$cacheFile = null;
if ($method === 'GET') {
    $cacheFile = sys_get_temp_dir() . '/kvrelay_' . md5($u) . '.cache';
    if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < 3) {
        header('Content-Type: application/json');
        header('X-Relay-Cache: HIT');
        http_response_code(200);
        echo file_get_contents($cacheFile);
        exit;
    }
}

$ch = curl_init($u);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
curl_setopt($ch, CURLOPT_TIMEOUT, 8);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
$body = file_get_contents('php://input');
if ($method !== 'GET' && strlen($body) > 0) { curl_setopt($ch, CURLOPT_POSTFIELDS, $body); }
$resp = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err = curl_error($ch);
curl_close($ch);
header('Content-Type: application/json');
http_response_code($code ? $code : 502);
if ($resp === false) { echo json_encode(array('error'=>'relay fail','detail'=>$err)); exit; }
if ($cacheFile && $code === 200) { @file_put_contents($cacheFile, $resp, LOCK_EX); }
echo $resp;
