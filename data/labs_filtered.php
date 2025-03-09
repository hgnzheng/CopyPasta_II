<?php
// labs_filtered.php - Server-side filtering for lab results by case ID

// Set headers for JSON response
header('Content-Type: application/json');

// Check if case ID is provided
if (!isset($_GET['caseid']) || !is_numeric($_GET['caseid'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing or invalid case ID']);
    exit;
}

$caseId = (int)$_GET['caseid'];
$filteredLabs = [];

// Path to labs data file
$dataFile = 'labs.txt';

// Check if file exists
if (!file_exists($dataFile)) {
    http_response_code(500);
    echo json_encode(['error' => 'Data file not found']);
    exit;
}

// Open the file
$handle = fopen($dataFile, 'r');
if (!$handle) {
    http_response_code(500);
    echo json_encode(['error' => 'Cannot open data file']);
    exit;
}

// Read the header
$header = fgetcsv($handle);
if (!$header) {
    http_response_code(500);
    echo json_encode(['error' => 'Invalid data file format']);
    fclose($handle);
    exit;
}

// Find index of caseid column
$caseIdIndex = array_search('caseid', $header);
if ($caseIdIndex === false) {
    http_response_code(500);
    echo json_encode(['error' => 'Case ID column not found in data']);
    fclose($handle);
    exit;
}

// Set a limit to avoid overloading
$limit = 500;
$count = 0;

// Process the file line by line
while (($data = fgetcsv($handle)) !== false) {
    // Check if this row matches the requested case ID
    if (isset($data[$caseIdIndex]) && (int)$data[$caseIdIndex] === $caseId) {
        $lab = [];
        foreach ($header as $i => $columnName) {
            if (isset($data[$i])) {
                // Convert to appropriate types
                if ($columnName === 'caseid') {
                    $lab[$columnName] = (int)$data[$i];
                } elseif ($columnName === 'dt') {
                    $lab[$columnName] = (int)$data[$i];
                } elseif ($columnName === 'result' && is_numeric($data[$i])) {
                    $lab[$columnName] = (float)$data[$i];
                } else {
                    $lab[$columnName] = $data[$i];
                }
            }
        }
        $filteredLabs[] = $lab;
        
        // Check if we've reached the limit
        $count++;
        if ($count >= $limit) {
            break;
        }
    }
}

fclose($handle);

// Return the filtered data
echo json_encode($filteredLabs); 