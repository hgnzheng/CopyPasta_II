# I. Project Setup and Data Acquisition

1. Data Download and Initial Inspection
   - **Download Data Files:**
     - Retrieve the Korean hospital dataset (CSV files) from VitalDB (https://vitaldb.net/dataset/).
     - Verify file integrity by checking file sizes, comparing MD5/SHA hashes (if available), and ensuring all expected files are present.
   - **Initial Data Exploration:**
     - Open a few CSV files to inspect headers, data types, and sample values.
     - Identify key biosignals (e.g., heart rate, blood pressure, oxygen saturation) and metadata (surgical phase, timestamps, intervention notes).

2. Data Integration and Storage
   - **Merge Datasets:**
     - If data are split into multiple files (e.g., different sensors or outcomes), merge them using a unique surgery identifier.
     - Align time series from different files by matching timestamps.
   - **Database Setup:**
     - Create a structured database (SQL or NoSQL) or an efficient file system to store the merged data.
     - Document data schemas and relationships (e.g., surgery ID, biosignal readings, intervention events).

# II. Data Preprocessing and Feature Engineering

1. Data Cleaning
   - **Handling Missing Values:**
     - Identify and fill in missing values using interpolation or imputation methods where appropriate.
     - Remove or flag records with excessive missing data.
   - **Outlier Detection:**
     - Use statistical methods (e.g., Z-scores, IQR) to identify outliers.
     - Decide whether to cap, transform, or exclude extreme values based on clinical relevance.
   - **Normalization and Standardization:**
     - Normalize biosignal data to a common scale to facilitate comparison across different sensors.
     - Document transformation methods for reproducibility.

2. Timestamp Synchronization and Segmentation
   - **Time Alignment:**
     - Convert timestamps into a uniform format (e.g., Unix epoch or ISO 8601).
     - Synchronize readings across multiple sensors using common time anchors.
   - **Segmentation of Surgical Phases:**
     - Define clear phases (e.g., pre-op, induction, incision, critical intervention, closing).
     - Label data segments based on timestamps, intervention logs, or other markers.
   - **Annotating Contextual Metadata:**
     - Integrate contextual data (e.g., patient demographics, surgery type) into the time-series for richer visualization.

3. Anomaly Detection and Labeling
   - **Algorithm Development:**
     - Design or adapt anomaly detection algorithms (e.g., moving averages, threshold-based triggers) to automatically flag sudden changes in biosignals.
     - Tune sensitivity parameters based on clinical guidelines.
   - **Labeling Anomalies:**
     - Annotate anomalies with details (e.g., type of deviation, magnitude, duration).
     - Create a separate log that maps anomaly events to potential interventions.

4. Intervention Mapping and Feature Extraction
   - **Extracting Intervention Data:**
     - Parse intervention records from medical notes or logs.
     - Link each intervention to its corresponding anomaly event using time proximity.
   - **Feature Engineering:**
     - Derive additional features such as rate of change, variance within segments, and cumulative metrics.
     - Validate that these features correlate with known outcomes (e.g., recovery time, complication rate).

# III. Interactive Visualization Components

## A. Part 1 – The Surgery’s Pulse: Multi-Timeline Dashboard

1. Animated Time-Series Visualization
   - **Design and Layout:**
     - Develop a main panel that displays continuous, animated biosensor data across the surgery timeline.
     - Include dynamic annotations marking key events (phase transitions, scheduled interventions).
   - **Playback Controls:**
     - Implement play, pause, rewind, and fast-forward buttons.
     - Allow users to adjust playback speed and manually scrub through the timeline.
   - **Dynamic Annotations:**
     - Integrate real-time updates to annotations (e.g., flashing icons or color changes when a threshold is crossed).

2. Overview (Miniature) Timeline
   - **Mini Timeline Display:**
     - Place a compact version of the full surgical timeline at the bottom of the main panel.
     - Use a simplified visual style to show the entire duration at a glance.
   - **Brushing and Linking:**
     - Enable users to click and drag on the overview to select a specific time segment.
     - Synchronize this selection so that the main time-series zooms into the selected segment.
   - **Contextual Indicators:**
     - Highlight key events on the overview timeline to guide the brushing interaction.

3. Automated Anomaly Detection and Alert Markers
   - **Overlaying Markers:**
     - Superimpose color-coded markers on the main time-series plot where anomalies are detected.
     - Use a legend to explain marker colors (e.g., red for critical, yellow for warning).
   - **Interactive Tooltips:**
     - On hover, display pop-up tooltips with detailed anomaly information (e.g., “BP dropped 30% in 10 sec during incision phase”).
   - **Click-to-Drill Feature:**
     - Enable users to click on markers to trigger a transition into the crisis analysis view.

## B. Part 2 – Crisis Moments: Detailed Crisis Intervention Analysis

1. Zoomable Detailed Time-Series Visualization
   - **High-Resolution Data View:**
     - When a user clicks an alert marker, load a zoomed-in view of that specific time segment.
     - Display multiple biosignals with finer granularity.
   - **Interactive Zoom and Pan Controls:**
     - Integrate slider bars or pinch-to-zoom features for detailed examination.
     - Allow users to selectively focus on one biosignal at a time.
   - **Filter Options:**
     - Provide checkboxes or dropdowns to filter out less-relevant signals, focusing on the anomaly in question.

2. Interactive Intervention Tree / Decision Flowchart
   - **Flowchart Design:**
     - Create a visual map that outlines the sequence of interventions triggered by the anomaly.
     - Use nodes and branches to represent each decision point and action taken.
   - **Clickable Nodes:**
     - Each node in the tree is interactive; clicking reveals a pop-up panel with:
       - Timestamps of the intervention
       - Dosage details, if applicable
       - Surgeon or nurse notes
       - Outcome indicators (e.g., stabilization of vital signs)
   - **Linkage with Detailed Time-Series:**
     - Synchronize the intervention tree with the zoomed-in time-series so that selecting a node highlights the corresponding time segment.
   - **Visual Cues:**
     - Use color gradients or animation (e.g., cascading highlights) to illustrate the progression from anomaly detection to intervention.

3. Crisis Outcome Simulation
   - **Simulation Control Panel:**
     - Integrate sliders or input fields allowing users to adjust biosignal parameters (e.g., simulate a less severe blood pressure drop).
     - Provide immediate visual feedback on how these adjustments might alter the intervention tree.
   - **Predictive Outcome Visualization:**
     - Display real-time predictions (e.g., changes in recovery time, likelihood of complications) based on the simulated inputs.
     - Use comparative charts to show simulated versus actual outcomes.

# IV. Website Storytelling Page Structure

Design a multi-page interactive website that weaves the narrative together and guides users through the entire story:

## Homepage / Landing Page
   - **Hero Section:**
     - A visually appealing banner with a title like “Surgery Life-Line: From Pulse to Crisis Intervention.”
     - A short introductory paragraph outlining the purpose and significance of the project.
   - **Navigation Bar:**
     - Menu items for “Overview,” “Interactive Dashboard,” “Crisis Analysis,” “Comparative Insights,” and “About/Documentation.”
   - **Call-to-Action:**
     - A prominent button (e.g., “Start Exploring”) that takes users to the interactive dashboard.

## Overview Page: The Big Picture
   - **Introduction to the Dataset:**
     - Brief summary of the Korean hospital dataset, its clinical significance, and the types of biosignals tracked.
   - **Story Narrative:**
     - A written narrative that explains the concept of the “surgery pulse” and how the data reflect the life of a surgery.
   - **Preview Visualizations:**
     - Embedded static or low-interaction versions of the main time-series and overview timeline to set expectations.
   - **Navigation Link:**
     - A button leading to the full interactive dashboard.

## Interactive Dashboard Page: The Surgery’s Pulse
   - **Main Time-Series Panel:**
     - Full-screen interactive animated time-series plot with playback controls.
     - Dynamic annotations and real-time markers.
   - **Overview Timeline Panel:**
     - Positioned below or alongside the main plot; includes brushing and linking features.
   - **Sidebar Information:**
     - A sidebar displaying a legend, current time stamp, and a list of detected anomalies with quick summary info.
   - **Interactivity Instructions:**
     - A brief on-page tutorial (or overlay help) that explains how to use brushing, play/pause, and marker clicks.
   - **Transition Triggers:**
     - Clicking an anomaly marker smoothly transitions the view to the Crisis Analysis Page.

## Crisis Analysis Page: Deep Dive into Critical Moments
   - **Split-Screen Layout:**
     - Left Panel: Zoomed-in, detailed time-series visualization of the selected anomaly segment.
     - Right Panel: Interactive intervention tree/decision flowchart.
   - **Interactive Elements:**
     - Nodes in the intervention tree are clickable, revealing pop-up panels with detailed context (intervention timestamps, notes, outcomes).
     - Zoom and pan controls for the detailed time-series panel.
   - **Simulation Section:**
     - A dedicated sub-panel with simulation controls (sliders, input fields) that allow “what-if” testing of biosignal adjustments.
     - A real-time outcome chart comparing simulated results with actual data.
   - **Back Navigation:**
     - A persistent button to return to the full dashboard view, maintaining the context of the overall surgery timeline.

## Comparative Insights (Optional Advanced Analysis) Page
   - **Aggregated Dashboard:**
     - Overlays multiple surgeries using charts such as bubble charts, violin plots, or parallel coordinate plots.
     - Filters to compare surgeries based on type, patient demographics, or frequency of crises.
   - **Risk Profiling Visuals:**
     - Visual summaries highlighting trends in risk levels and outcomes across different surgery categories.
   - **Interactive Filters:**
     - Dynamic filtering options that update all visualizations in real time, enabling cross-comparisons.

## About / Documentation Page
   - **Project Description:**
     - Detailed explanation of the project’s goals, methodology, and significance.
     - Information on the data source, preprocessing steps, and algorithms used.
   - **Technical Documentation:**
     - Links to technical documentation, code repositories, and data dictionaries.
   - **User Guide:**
     - A step-by-step guide explaining how to navigate and interact with the visualizations.
   - **Contact & Feedback:**
     - A form or contact information for users to provide feedback or ask questions.

# V. Testing, Iteration, and Deployment

1. **Usability Testing and Feedback Collection**
   - Recruit clinicians, data scientists, and potential end users to test interactive elements and navigation.
   - Record observations on ease of use, clarity of visualizations, and overall storytelling effectiveness.
2. **Iterative Refinement**
   - Refine visual elements, transitions, and interactivity based on collected feedback.
   - Optimize performance for smooth animations and real-time data handling.
3. **Domain Expert Validation**
   - Present the integrated tool to surgical and medical experts for validation of clinical relevance and accuracy.
   - Adjust thresholds and narratives as needed.
4. **Final Deployment**
   - Deploy the website on a reliable hosting platform.
   - Ensure cross-browser compatibility and mobile responsiveness.
   - Prepare final documentation and user guides.

# VI. Final Presentation and Documentation

1. **Technical Documentation**
   - Compile detailed documentation covering data preprocessing, visualization design, and system architecture.
   - Include code annotations, flow diagrams, and feature explanations.
2. **User Guide and Tutorial**
   - Develop a video or interactive tutorial guiding users through the website’s functionalities.
   - Provide written documentation with screenshots and step-by-step instructions.
3. **Presentation Preparation**
   - Create a slide deck summarizing the project, emphasizing the integrated narrative from the continuous surgery pulse to the in-depth crisis intervention analysis.
   - Highlight key insights, interactive features, and potential clinical implications.
