<?php
declare(strict_types=1);
namespace Fillico;

/** OOXML reader and writer for the two-sheet product template. */
final class ProductWorkbook {
    public const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    public const UPLOAD_LIMIT = 3 * 1024 * 1024;
    private const XML_LIMIT = 10 * 1024 * 1024;
    private const MAX_ROWS = 5000;
    private const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    private const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    private const PACKAGE_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
    public const HEADERS = [
        'Sản phẩm'=>['Mã sản phẩm','Phiên bản','Tên sản phẩm','Danh mục','Mô tả','Tình trạng'],
        'Phân loại'=>['Mã sản phẩm','Mã phân loại','Phiên bản','Tên phân loại','SKU','Giá bán (₫)','Tồn kho'],
    ];

    public static function supported(): bool {
        return class_exists(\ZipArchive::class) && class_exists(\DOMDocument::class);
    }

    public static function write(array $data): string {
        $bytes = self::withZip(null, static function (\ZipArchive $zip) use ($data): void {
            $declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
            $overrides = $sheets = $relations = '';
            $sheetBytes = 0;
            foreach (array_keys(self::HEADERS) as $index=>$name) {
                $number = $index + 1;
                $part = "worksheets/sheet$number.xml";
                $sheets .= '<sheet name="'.self::xml($name).'" sheetId="'.$number.'" r:id="rId'.$number.'"/>';
                $relations .= '<Relationship Id="rId'.$number.'" Type="'.self::REL.'/worksheet" Target="'.$part.'"/>';
                $overrides .= '<Override PartName="/xl/'.$part.'" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
                $sheet = $declaration.self::sheet($name, $data[$name]);
                $sheetBytes += strlen($sheet);
                if ($sheetBytes > self::XML_LIMIT - 16384) fail(413, 'Dữ liệu quá lớn để xuất thành một tệp Excel có thể nhập lại.');
                self::add($zip, 'xl/'.$part, $sheet);
            }
            $relations .= '<Relationship Id="rId3" Type="'.self::REL.'/styles" Target="styles.xml"/>';
            self::add($zip, 'xl/_rels/workbook.xml.rels', $declaration.'<Relationships xmlns="'.self::PACKAGE_REL.'">'.$relations.'</Relationships>');
            self::add($zip, '_rels/.rels', $declaration.'<Relationships xmlns="'.self::PACKAGE_REL.'"><Relationship Id="rId1" Type="'.self::REL.'/officeDocument" Target="xl/workbook.xml"/></Relationships>');
            self::add($zip, 'xl/workbook.xml', $declaration.'<workbook xmlns="'.self::MAIN.'" xmlns:r="'.self::REL.'"><sheets>'.$sheets.'</sheets></workbook>');
            self::add($zip, '[Content_Types].xml', $declaration.'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'.$overrides.'</Types>');
            self::add($zip, 'xl/styles.xml', $declaration.'<styleSheet xmlns="'.self::MAIN.'"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF285437"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>');
        });
        if ($bytes === false) throw new \RuntimeException('Cannot read generated workbook');
        if (strlen($bytes) > self::UPLOAD_LIMIT) fail(413, 'Tệp xuất vượt giới hạn 3 MB để nhập lại.');
        return $bytes;
    }

    private static function sheet(string $name, array $data): string {
        if (count($data) > self::MAX_ROWS) fail(413, 'Danh mục vượt 5.000 dòng mỗi sheet. Giảm phạm vi xuất hoặc liên hệ quản trị.');
        $product = $name === 'Sản phẩm';
        $widths = $product ? [39,14,34,28,55,24] : [39,39,14,34,23,18,13];
        $note = $product
            ? 'Giữ cột A–B. Chỉ sửa cột C–F. Chọn Đang hiển thị hoặc Đang ẩn. Ô trống giữ nguyên.'
            : 'Giữ cột A–C. Chỉ sửa cột D–G. SKU là văn bản. Giá và tồn dùng số nguyên. Ô trống giữ nguyên.';
        $cols = '';
        foreach ($widths as $index=>$width) $cols .= '<col min="'.($index+1).'" max="'.($index+1).'" width="'.$width.'" customWidth="1"/>';
        $rows = '<row r="1">'.self::cell('A1', $note, 0).'</row>';
        foreach (array_merge([self::HEADERS[$name]], $data) as $index=>$values) {
            $row = $index + 2;
            $rows .= '<row r="'.$row.'">';
            foreach ($values as $column=>$value) {
                $style = $index === 0 ? 2 : (is_string($value) ? 1 : 0);
                $rows .= self::cell(chr(65+$column).$row, $value, $style);
            }
            $rows .= '</row>';
        }
        $last = chr(64+count($widths));
        return '<worksheet xmlns="'.self::MAIN.'"><sheetViews><sheetView workbookViewId="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>'.$cols.'</cols><sheetData>'.$rows.'</sheetData><autoFilter ref="A2:'.$last.(count($data)+2).'"/><mergeCells count="1"><mergeCell ref="A1:'.$last.'1"/></mergeCells></worksheet>';
    }

    private static function cell(string $ref, int|string $value, int $style): string {
        if (is_int($value)) return '<c r="'.$ref.'" s="'.$style.'"><v>'.$value.'</v></c>';
        return '<c r="'.$ref.'" s="'.$style.'" t="inlineStr"><is><t xml:space="preserve">'.self::xml($value).'</t></is></c>';
    }

    private static function xml(string $value): string {
        return htmlspecialchars($value, ENT_XML1 | ENT_QUOTES | ENT_SUBSTITUTE | ENT_DISALLOWED, 'UTF-8');
    }

    private static function add(\ZipArchive $zip, string $name, string $content): void {
        if (!$zip->addFromString($name, $content)) throw new \RuntimeException('Cannot write XLSX part');
    }

    public static function read(string $bytes): array {
        if (strlen($bytes) > self::UPLOAD_LIMIT) fail(413, 'Tệp Excel tối đa 3 MB.');
        return self::withZip($bytes, static function (\ZipArchive $zip): array {
            self::checkArchive($zip);
            $book = self::part($zip, 'xl/workbook.xml', 'workbook', self::MAIN);
            $rels = self::part($zip, 'xl/_rels/workbook.xml.rels', 'Relationships', self::PACKAGE_REL);
            $parts = [];
            $shared = [];
            foreach ($rels->getElementsByTagNameNS(self::PACKAGE_REL, 'Relationship') as $rel) {
                if ($rel->getAttribute('TargetMode') === 'External') continue;
                $target = $rel->getAttribute('Target');
                $part = str_starts_with($target,'/') ? ltrim($target,'/') : 'xl/'.$target;
                if ($rel->getAttribute('Type') === self::REL.'/worksheet' && preg_match('~^xl/worksheets/[A-Za-z0-9_]+\.xml$~D', $part)) {
                    $parts[$rel->getAttribute('Id')] = $part;
                }
                if ($rel->getAttribute('Type') === self::REL.'/sharedStrings' && $part === 'xl/sharedStrings.xml') {
                    $strings = self::part($zip, $part, 'sst', self::MAIN);
                    foreach ($strings->getElementsByTagNameNS(self::MAIN, 'si') as $string) $shared[] = self::stringValue($string);
                }
            }
            $data = [];
            foreach ($book->getElementsByTagNameNS(self::MAIN, 'sheet') as $sheet) {
                $name = $sheet->getAttribute('name');
                $part = $parts[$sheet->getAttributeNS(self::REL, 'id')] ?? null;
                if (!isset(self::HEADERS[$name]) || isset($data[$name]) || !$part) self::badTemplate();
                $data[$name] = self::readSheet(self::part($zip, $part, 'worksheet', self::MAIN), $name, $shared);
            }
            if (count($data) !== 2) self::badTemplate();
            return $data;
        });
    }

    private static function checkArchive(\ZipArchive $zip): void {
        if ($zip->numFiles > 80) self::badTemplate();
        $total = 0;
        for ($index=0; $index<$zip->numFiles; $index++) {
            $info = $zip->statIndex($index);
            if (!$info || ($info['encryption_method'] ?? 0) !== 0) self::badTemplate();
            $total += $info['size'];
            if ($total > self::XML_LIMIT || str_contains(strtolower($info['name']), 'vbaproject')) self::badTemplate();
        }
    }

    private static function part(\ZipArchive $zip, string $name, string $root, string $ns): \DOMDocument {
        $raw = $zip->getFromName($name, self::XML_LIMIT + 1);
        if (!$raw || strlen($raw)>self::XML_LIMIT || str_contains($raw, "\0") || preg_match('/<!DOCTYPE|<!ENTITY/i', $raw)) self::badTemplate();
        $document = new \DOMDocument();
        if (!@$document->loadXML($raw, LIBXML_NONET | LIBXML_COMPACT)
            || $document->doctype || $document->documentElement?->localName !== $root
            || $document->documentElement?->namespaceURI !== $ns) self::badTemplate();
        return $document;
    }

    private static function readSheet(\DOMDocument $document, string $sheet, array $shared): array {
        $headers = self::HEADERS[$sheet];
        $width = count($headers);
        $rows = [];
        $sheetData = $document->getElementsByTagNameNS(self::MAIN, 'sheetData')->item(0);
        if (!$sheetData) self::badTemplate();
        foreach ($sheetData->getElementsByTagNameNS(self::MAIN, 'row') as $row) {
            $rowNumber = (int)$row->getAttribute('r');
            if ($rowNumber<1 || $rowNumber>self::MAX_ROWS+2 || isset($rows[$rowNumber])) self::badTemplate();
            $values = array_fill(0, $width, null);
            $seen = [];
            foreach ($row->getElementsByTagNameNS(self::MAIN, 'c') as $cell) {
                if (!preg_match('/^([A-Z]{1,3})([1-9][0-9]*)$/D', $cell->getAttribute('r'), $match) || (int)$match[2] !== $rowNumber) self::badTemplate();
                $reference = $match[1];
                if (isset($seen[$reference])) self::badTemplate();
                $seen[$reference] = true;
                if ($cell->getElementsByTagNameNS(self::MAIN, 'f')->length) fail(400, "$sheet · dòng $rowNumber · cột {$match[1]}: Không chấp nhận công thức.");
                try {
                    $value = self::readCell($cell, $shared);
                } catch (HttpError $error) {
                    fail(400, "$sheet · dòng $rowNumber · cột $reference: Kiểu dữ liệu không hợp lệ.");
                }
                $column = ord($reference[0])-65;
                if (strlen($reference) > 1 || $column >= $width) {
                    if ($value !== null) fail(400, "$sheet · dòng $rowNumber · cột {$match[1]}: Cột nằm ngoài mẫu.");
                    continue;
                }
                $values[$column] = $value;
            }
            $rows[$rowNumber] = $values;
        }
        foreach ($headers as $column=>$header) {
            if (($rows[2][$column] ?? null) !== $header) {
                fail(400, "$sheet · dòng 2 · cột ".chr(65+$column).": Tiêu đề cột khác mẫu đã xuất.");
            }
        }
        unset($rows[1], $rows[2]);
        return array_filter($rows, static fn($row)=>count(array_filter($row, static fn($value)=>$value!==null))>0);
    }

    private static function readCell(\DOMElement $cell, array $shared): int|string|null {
        $value = $cell->getElementsByTagNameNS(self::MAIN, 'v')->item(0)?->textContent;
        $result = match ($cell->getAttribute('t')) {
            'inlineStr' => self::stringValue($cell),
            's' => is_string($value) && ctype_digit($value) && isset($shared[(int)$value]) ? $shared[(int)$value] : self::badTemplate(),
            'str' => $value,
            '', 'n' => $value === null || $value === '' ? null : (preg_match('/^-?[0-9]{1,12}$/D', $value) ? (int)$value : $value),
            default => self::badTemplate(),
        };
        return is_string($result) && trim($result) === '' ? null : $result;
    }

    private static function stringValue(\DOMElement $node): string {
        $text = '';
        foreach ($node->getElementsByTagNameNS(self::MAIN, 't') as $fragment) {
            if ($fragment->parentNode?->localName !== 'rPh') $text .= $fragment->textContent;
        }
        return $text;
    }

    private static function badTemplate(): never {
        fail(400, 'Tệp Excel không đúng mẫu. Hãy tải lại mẫu từ Sản phẩm & kho.');
    }

    private static function withZip(?string $bytes, callable $callback): mixed {
        if (!self::supported()) fail(503, 'Tính năng Excel cần bật extension PHP zip và dom trên hosting.');
        $path = tempnam(sys_get_temp_dir(), 'fillico-xlsx-');
        if ($path === false) throw new \RuntimeException('Cannot create temporary workbook');
        $zip = new \ZipArchive();
        try {
            if ($bytes !== null && file_put_contents($path, $bytes) !== strlen($bytes)) throw new \RuntimeException('Cannot save temporary workbook');
            if ($zip->open($path, $bytes === null ? \ZipArchive::CREATE | \ZipArchive::OVERWRITE : \ZipArchive::RDONLY) !== true) self::badTemplate();
            try { $result = $callback($zip); }
            finally { $zip->close(); }
            return $bytes === null ? file_get_contents($path) : $result;
        } finally {
            unlink($path);
        }
    }
}
