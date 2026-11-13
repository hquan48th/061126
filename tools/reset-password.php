<?php
declare(strict_types=1);
// LOCAL CLI ONLY: creates SQL for phpMyAdmin. Does not connect to any database.
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
if($argc!==3){fwrite(STDERR,"Usage: php reset-password.php user-id private-output.sql\nPassword: type on hidden terminal input (12–200 UTF-8 characters).\n");exit(1);}
if(!in_array('argon2id',password_algos(),true)){fwrite(STDERR,"PHP Argon2id required.\n");exit(1);}
$id=$argv[1];$file=$argv[2];
if($id===''||strlen($id)>400||file_exists($file)){fwrite(STDERR,"Invalid ID or output exists.\n");exit(1);}
// Read from stdin, never argv/env. Pipes are allowed for controlled local automation.
$tty=function_exists('stream_isatty')&&stream_isatty(STDIN);$state=null;
if($tty){$state=shell_exec('stty -g');if(!$state){fwrite(STDERR,"Cannot hide terminal input.\n");exit(1);}system('stty -echo');fwrite(STDERR,'New password: ');}
try{$password=rtrim((string)fgets(STDIN),"\r\n");}finally{if($state!==null){system('stty '.escapeshellarg(trim($state)));fwrite(STDERR,"\n");}}
if(!preg_match('//u',$password)||strlen(iconv('UTF-8','UTF-16LE',$password))/2<12||strlen(iconv('UTF-8','UTF-16LE',$password))/2>200||trim($password)!==$password){fwrite(STDERR,"Password must be 12–200 characters, no surrounding spaces.\n");exit(1);}
$hash=password_hash($password,PASSWORD_ARGON2ID,['memory_cost'=>19456,'time_cost'=>2,'threads'=>1]);$idHex=bin2hex($id);$hashHex=bin2hex($hash);
$sql="-- PRIVATE: import once in phpMyAdmin; verify affected user; delete this SQL after use.\nSET NAMES utf8mb4;\nSTART TRANSACTION;\nSELECT id FROM settings WHERE id=1 FOR UPDATE;\nUPDATE users SET password_hash=CONVERT(0x$hashHex USING utf8mb4) WHERE id=CONVERT(0x$idHex USING utf8mb4);\nDELETE FROM sessions WHERE user_id=CONVERT(0x$idHex USING utf8mb4);\nINSERT INTO audit(user_id,action,detail,created_at) VALUES(NULL,'password.reset.offline',JSON_OBJECT('id',CONVERT(0x$idHex USING utf8mb4)),CONCAT(LEFT(DATE_FORMAT(UTC_TIMESTAMP(3),'%Y-%m-%dT%H:%i:%s.%f'),23),'Z'));\nCOMMIT;\nSELECT id,email,role FROM users WHERE id=CONVERT(0x$idHex USING utf8mb4);\n";
$f=fopen($file,'xb');if(!$f){fwrite(STDERR,"Cannot create output.\n");exit(1);}chmod($file,0600);fwrite($f,$sql);fclose($f);fwrite(STDOUT,"Private reset SQL created. No plaintext password stored.\n");
