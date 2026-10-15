<?php
// Change display branding only. Preserve scripts, endpoints, source and legal files.
function olamide_brand_html($html) {
    $parts = preg_split('/(<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>|<!--[\s\S]*?-->|<[^>]*>)/i', $html, -1, PREG_SPLIT_DELIM_CAPTURE);
    foreach ($parts as &$part) {
        if ($part === '') continue;
        if ($part[0] !== '<') {
            $part = preg_replace('/\bASTPP\b/i', 'Olamide SIP', $part);
        } elseif (!preg_match('/^<(script|style)\b|^<!--/i', $part)) {
            $part = preg_replace_callback('/\b(alt|title|aria-label|placeholder)=("[^"]*"|\x27[^\x27]*\x27)/i', function ($m) {
                return $m[1].'='.preg_replace('/\bASTPP\b/i', 'Olamide SIP', $m[2]);
            }, $part);
            if (preg_match('/^<img\b/i', $part)) {
                $part = preg_replace('/\bsrc=("|\x27)[^"\x27]*\/(logo|logo_login|astpp_logo)\.(png|jpg|svg)\1/i', 'src="/olamide-logo.svg"', $part);
            }
        }
    }
    unset($part);
    return implode('', $parts);
}
ob_start(function ($body) {
    $html = false;
    foreach (headers_list() as $header) if (stripos($header, 'Content-Type:') === 0) $html = stripos($header, 'text/html') !== false;
    if (!$html && !preg_match('/<!doctype html|<html\b/i', $body)) return $body;
    return olamide_brand_html($body);
});
