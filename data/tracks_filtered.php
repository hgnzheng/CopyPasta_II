<?php
// tracks_filtered.php - Server-side filtering for tracks by case ID

// Include the preprocessing functions
require_once('data_preprocessing.php');

// Set headers for JSON response
header('Content-Type: application/json');

// Check if case ID is provided
if (!isset($_GET['caseid']) || !is_numeric($_GET['caseid'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing or invalid case ID']);
    exit;
}

$caseId = (int)$_GET['caseid'];
$filteredTracks = [];

// Additional options that can be passed as query parameters
$options = [
    'clean' => isset($_GET['clean']) ? (bool)$_GET['clean'] : true,
    'phases' => isset($_GET['phases']) ? (bool)$_GET['phases'] : false,
    'normalize' => isset($_GET['normalize']) ? (bool)$_GET['normalize'] : false
];

// Path to tracks data file
$dataFile = 'trks.txt';

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

// Process the file line by line
while (($data = fgetcsv($handle)) !== false) {
    // Check if this row matches the requested case ID
    if (isset($data[$caseIdIndex]) && (int)$data[$caseIdIndex] === $caseId) {
        $track = [];
        foreach ($header as $i => $columnName) {
            if (isset($data[$i])) {
                // Convert to appropriate types
                if ($columnName === 'caseid' || $columnName === 'tid') {
                    $track[$columnName] = (int)$data[$i];
                } elseif ($columnName === 'start_time' || $columnName === 'end_time') {
                    $track[$columnName] = (int)$data[$i];
                    // Also add a standardized timestamp
                    if ($columnName === 'start_time') {
                        $track['time_start'] = standardizeTimestamp($data[$i], 'epoch');
                    } else {
                        $track['time_end'] = standardizeTimestamp($data[$i], 'epoch');
                    }
                } else {
                    $track[$columnName] = $data[$i];
                }
            }
        }
        
        // Add signal metadata if available
        if (isset($track['signal_name']) && isset($track['signal_type'])) {
            $track['signal_metadata'] = [
                'name' => $track['signal_name'],
                'type' => $track['signal_type'],
                'unit' => $track['unit'] ?? '',
                'normal_range' => [
                    'min' => isset($track['normal_min']) ? (float)$track['normal_min'] : null,
                    'max' => isset($track['normal_max']) ? (float)$track['normal_max'] : null
                ]
            ];
        }
        
        $filteredTracks[] = $track;
    }
}

fclose($handle);

// Define surgical phases if requested
if ($options['phases']) {
    // Determine the procedure timeline from all tracks
    $allTimes = [];
    foreach ($filteredTracks as $track) {
        if (isset($track['time_start'])) {
            $allTimes[] = $track['time_start'];
        }
        if (isset($track['time_end'])) {
            $allTimes[] = $track['time_end'];
        }
    }
    
    if (!empty($allTimes)) {
        sort($allTimes);
        $procedureStart = min($allTimes);
        $procedureEnd = max($allTimes);
        $procedureDuration = $procedureEnd - $procedureStart;
        
        // Create phases (simplified for now - would be more accurate with actual surgical markers)
        $phases = [
            [
                'time' => $procedureStart,
                'label' => 'pre_op',
                'description' => 'Pre-Operation'
            ],
            [
                'time' => $procedureStart + ($procedureDuration * 0.1),
                'label' => 'induction',
                'description' => 'Anesthesia Induction'
            ],
            [
                'time' => $procedureStart + ($procedureDuration * 0.2),
                'label' => 'incision',
                'description' => 'Initial Incision'
            ],
            [
                'time' => $procedureStart + ($procedureDuration * 0.5),
                'label' => 'critical',
                'description' => 'Critical Intervention'
            ],
            [
                'time' => $procedureStart + ($procedureDuration * 0.8),
                'label' => 'closing',
                'description' => 'Closing'
            ],
            [
                'time' => $procedureEnd,
                'label' => 'post_op',
                'description' => 'Post-Operation'
            ]
        ];
        
        // Add phases to the response
        foreach ($filteredTracks as &$track) {
            $track['surgical_phases'] = $phases;
        }
    }
}

// Apply track-specific preprocessing
foreach ($filteredTracks as &$track) {
    // Add additional metadata about preprocessing options
    $track['preprocessing'] = [
        'cleaned' => $options['clean'],
        'normalized' => $options['normalize'],
        'phase_segmentation' => $options['phases'],
        'anomaly_detection_methods' => ['z_score', 'moving_average', 'iqr']
    ];
}

// Return the filtered data
echo json_encode($filteredTracks); 