<?php
// Read-only, one-menu-at-a-time source/schema validation; never expose DB credentials.
try {
    $manifest = json_decode(file_get_contents(__DIR__.'/menu-wiring.json'), true, 512, JSON_THROW_ON_ERROR);
    $requested = $argv[1] ?? 'all';
    $selected = array_values(array_filter($manifest['menus'], function ($m) use ($requested) { return $requested === 'all' || $m['id'] === $requested; }));
    if (!$selected) throw new RuntimeException('Unknown menu');
    $c = json_decode(file_get_contents('/run/native-astpp/config.json'), true, 512, JSON_THROW_ON_ERROR);
    mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
    $db = new mysqli('native-db', 'astppuser', $c['dbPassword'], 'astpp');
    $tables = []; $query = $db->query('SHOW TABLES');
    while ($row = $query->fetch_row()) $tables[] = $row[0];
    $report = []; $failed = false;
    foreach ($selected as $menu) {
        $row = ['id'=>$menu['id'], 'label'=>$menu['label'], 'path'=>$menu['path'], 'checks'=>[], 'liveSwitchAcceptance'=>'unverified'];
        if (!$menu['codeAvailable']) {
            $row['status'] = 'missing_upstream_module';
            $row['detail'] = 'This menu has no controller in the pinned Community release.';
        } else {
            $controller = '/var/www/html/application/'.$menu['controller'];
            $text = is_file($controller) ? file_get_contents($controller) : '';
            $row['checks']['controllerMethod'] = (bool)preg_match('/\bfunction\s+'.preg_quote($menu['method'], '/').'\s*\(/i', $text);
            $row['checks']['models'] = true;
            foreach ($menu['models'] as $model) if (!is_file('/var/www/html/application/'.$model)) $row['checks']['models'] = false;
            $row['missingTables'] = array_values(array_diff($menu['tables'], $tables));
            $row['checks']['referencedTables'] = !$row['missingTables'];
            $row['status'] = in_array(false, $row['checks'], true) ? 'failed' : 'source_and_schema_present';
            if ($row['status'] === 'failed') $failed = true;
        }
        $report[] = $row;
    }
    echo json_encode(['upstreamCommit'=>$manifest['upstreamCommit'], 'menus'=>$report, 'scope'=>'Source and literal schema dependencies only; HTTP, CRUD and live switch acceptance remain separate.'], JSON_PRETTY_PRINT).PHP_EOL;
    exit($failed ? 1 : 0);
} catch (Throwable $e) {
    fwrite(STDERR, "Native menu wiring validation failed; inspect the private runtime.\n"); exit(1);
}
