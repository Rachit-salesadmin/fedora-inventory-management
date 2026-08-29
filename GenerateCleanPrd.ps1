$ErrorActionPreference = "Stop"

function XmlEscape([string]$text) {
    return [System.Security.SecurityElement]::Escape($text)
}

function RunXml([string]$text, [string]$props = "") {
    if ([string]::IsNullOrEmpty($text)) { return "" }
    return "<w:r>$props<w:t xml:space=`"preserve`">$(XmlEscape $text)</w:t></w:r>"
}

function ParaXml([string]$text, [string]$style = "BodyText", [string]$align = "", [bool]$bold = $false) {
    $pPr = "<w:pPr><w:pStyle w:val=`"$style`"/>"
    if ($align) { $pPr += "<w:jc w:val=`"$align`"/>" }
    $pPr += "</w:pPr>"
    $rPr = ""
    if ($bold) { $rPr = "<w:rPr><w:b/></w:rPr>" }
    return "<w:p>$pPr$(RunXml $text $rPr)</w:p>"
}

function BlankPara() {
    return "<w:p><w:pPr><w:pStyle w:val=`"BodyText`"/></w:pPr></w:p>"
}

function BulletXml([string]$text) {
    return ParaXml "• $text" "BodyText"
}

function TableXml($headers, $rows) {
    $xml = "<w:tbl><w:tblPr><w:tblStyle w:val=`"TableGrid`"/><w:tblW w:w=`"0`" w:type=`"auto`"/><w:tblBorders><w:top w:val=`"single`" w:sz=`"4`" w:space=`"0`" w:color=`"D9E2F3`"/><w:left w:val=`"single`" w:sz=`"4`" w:space=`"0`" w:color=`"D9E2F3`"/><w:bottom w:val=`"single`" w:sz=`"4`" w:space=`"0`" w:color=`"D9E2F3`"/><w:right w:val=`"single`" w:sz=`"4`" w:space=`"0`" w:color=`"D9E2F3`"/><w:insideH w:val=`"single`" w:sz=`"4`" w:space=`"0`" w:color=`"D9E2F3`"/><w:insideV w:val=`"single`" w:sz=`"4`" w:space=`"0`" w:color=`"D9E2F3`"/></w:tblBorders></w:tblPr><w:tblGrid>"
    foreach ($h in $headers) { $xml += "<w:gridCol w:w=`"2400`"/>" }
    $xml += "</w:tblGrid>"
    $xml += "<w:tr>"
    foreach ($h in $headers) {
        $cellPara = ParaXml $h "TableHeader" "" $true
        $xml += "<w:tc><w:tcPr><w:shd w:fill=`"D9EAF7`"/></w:tcPr>$cellPara</w:tc>"
    }
    $xml += "</w:tr>"
    foreach ($row in $rows) {
        $xml += "<w:tr>"
        foreach ($cell in $row) {
            $cellPara = ParaXml ([string]$cell) "TableBody"
            $xml += "<w:tc>$cellPara</w:tc>"
        }
        $xml += "</w:tr>"
    }
    $xml += "</w:tbl>"
    return $xml
}

$body = ""
$body += ParaXml "Fedora Inventory Management App" "Title" "center"
$body += ParaXml "Final PRD and Firebase Production Build Plan" "Subtitle" "center"
$body += ParaXml "Prepared for senior review. Current status: workflow prototype tested and ready for production planning." "BodyText" "center"
$body += ParaXml "Date: 30 Jun 2026" "BodyText" "center"
$body += BlankPara

$body += ParaXml "1. Overview" "Heading1"
$body += ParaXml "Fedora requires an inventory and dispatch planning module for wallpaper catalogues across Panipat Hub, Delhi warehouse, and Bangalore warehouse. Panipat receives imported stock and feeds Delhi and Bangalore through pallet-ready sales orders and dispatch batches."
$body += ParaXml "The tested prototype validates the core workflow. The next version should be built as a Firebase-backed production module inside the existing Fedora multi-app dashboard."

$body += ParaXml "2. Business Problem" "Heading1"
@(
    "Manual refill planning worked when Fedora had 50-60 SKUs, but it is not reliable for 1,500+ SKUs across 20+ catalogues.",
    "Warehouse managers need recommendations based on stock, box size, maximum level, and reorder points.",
    "The system must prevent duplicate refill planning when stock is already pallet-ready or in transit.",
    "Some catalogues or specific patterns are not refilled to some warehouses, so catalogue-wise and SKU-wise ON/OFF controls are required.",
    "Management needs logs, issue reporting, and future error monitoring to know when something breaks."
) | ForEach-Object { $body += BulletXml $_ }

$body += ParaXml "3. Goals" "Heading1"
@(
    "Create a clear operational module for warehouse managers to plan refills from Panipat to Delhi and Bangalore.",
    "Keep latest warehouse inventory updated from Excel uploads.",
    "Recommend boxes to send using reorder-point logic.",
    "Track Pallet Ready, In Transit, and Received dispatch stages.",
    "Maintain logs for uploads, SOs, dispatch batches, received batches, voids, and issue reports.",
    "Prepare for Firebase hosting, authentication, permissions, backups, monitoring, and production reliability."
) | ForEach-Object { $body += BulletXml $_ }

$body += ParaXml "4. Users and Roles" "Heading1"
$body += TableXml @("Role","Access Required") @(
    @("Warehouse Manager","Upload catalogue master, upload inventory, edit refill settings, create pallet-ready SOs, create dispatch batches, mark received, report issues."),
    @("Admin / Owner","All warehouse manager access plus user management, audit review, rollback, production monitoring, and configuration approval."),
    @("Viewer / Senior Management","View dashboard, stock summary, dispatch tracker, logs, and export reports without operational edits.")
)

$body += ParaXml "5. Core Modules" "Heading1"
$modules = @(
    @("5.1 Dashboard", @(
        "Shows Active SKUs, Delhi Shortages, Bangalore Shortages, and Pallet Ready / In Transit summary.",
        "Delhi Shortages card opens Dispatch Planning on Delhi.",
        "Bangalore Shortages card opens Dispatch Planning on Bangalore.",
        "Pallet Ready / In Transit card opens Dispatch Planning.",
        "Dispatch Tracker rows are clickable and open the related SO or dispatch batch details.",
        "Warehouse Stock Summary shows current stock totals for Panipat, Delhi, and Bangalore."
    )),
    @("5.2 Catalogue Master", @(
        "Catalogue master can be imported from Excel/CSV or added manually.",
        "Each SKU stores catalogue name, SKU/pattern number, and box size.",
        "Catalogue-level refill ON/OFF exists for Delhi and Bangalore.",
        "SKU-level refill ON/OFF exists for Delhi and Bangalore.",
        "If a catalogue refill is OFF for a warehouse, that warehouse fields inside the catalogue dropdown become disabled and SKU-level toggles show OFF.",
        "Maximum, Reorder 1, and Reorder 2 can be edited per SKU and per warehouse.",
        "A single Apply to Catalogue control applies bulk Max/Reorder values to all SKUs in that catalogue. Blank bulk fields are ignored.",
        "Single-row Save updates one SKU without closing the expanded catalogue list."
    )),
    @("5.3 Inventory Uploads", @(
        "Inventory Excel/CSV uploads are supported for Panipat, Delhi, and Bangalore.",
        "Zoho inventory summary should include SKU and quantity available for sale columns.",
        "Upload replaces the latest current stock for that warehouse only.",
        "Previous dispatch/SO/log history must not be deleted when new inventory is uploaded.",
        "The local prototype keeps logs, but production should also keep previous inventory snapshots for audit and rollback."
    )),
    @("5.4 Dispatch Planning", @(
        "Dispatch Planning has Delhi and Bangalore tabs.",
        "Shortage Action Summary is the main table used to create pallet-ready SOs.",
        "Rows have selectable checkboxes and Select All. Deselected SKUs are excluded from SO creation and CSV export.",
        "Export button is inside Dispatch Planning and exports selected shortage rows for the active warehouse only.",
        "Pallet Ready SO cards are expandable and show SKU, catalogue, boxes, and rolls.",
        "Pallet Ready SOs can be voided. Voided SOs are removed from planning but retained in logs.",
        "Multiple pallet-ready SOs can be merged into one dispatch batch for one destination warehouse only.",
        "Dispatch batches are expandable and show SO numbers, SKU details, status, and Mark as Received button.",
        "Mark as Received is manual. Inventory upload must not automatically mark dispatches received."
    )),
    @("5.5 Unmet Shortages", @(
        "Unmet Shortages is a separate monitoring page.",
        "It shows SKUs that are short at Delhi/Bangalore but Panipat does not have at least one full box available.",
        "When Panipat stock becomes available through a new upload, those SKUs can move back into recommendation logic."
    )),
    @("5.6 Logs and Report Issue", @(
        "Logs replace the previous Inventory Updates tab.",
        "Logs include catalogue uploads, inventory uploads, pallet-ready SOs, dispatch batches, received actions, voided SOs, and issue reports.",
        "Report Issue button is available in the top bar. In the prototype it saves the issue into Logs. In production it should create an admin alert and error-monitoring event."
    ))
)
foreach ($m in $modules) {
    $body += ParaXml $m[0] "Heading2"
    foreach ($pt in $m[1]) { $body += BulletXml $pt }
}

$body += ParaXml "6. Refill Recommendation Logic" "Heading1"
$body += ParaXml "The final business rule is reorder-point based. Maximum is used as the target/upper planning level. Reorder 1 and Reorder 2 decide how many boxes are required before subtracting already planned boxes."
$body += TableXml @("Condition","Required Boxes Before Existing Planned Stock") @(
    @("Current stock >= Maximum","0 boxes"),
    @("Current stock <= Reorder 2","2 boxes"),
    @("Current stock <= Reorder 1","1 box"),
    @("Otherwise","0 boxes")
)
@(
    "Already planned boxes = floor((Pallet Ready rolls + In Transit rolls) / Box Size).",
    "Recommended boxes = Required boxes - Already planned boxes.",
    "If Panipat does not have at least one full box, the SKU goes to Unmet Shortages unless it is already pallet-ready/in-transit.",
    "If Panipat has fewer boxes than required, recommend only the boxes Panipat can actually supply.",
    "The same formula applies across Korean, European, Chinese, and future catalogues because box size, maximum, reorder 1, and reorder 2 are configurable."
) | ForEach-Object { $body += BulletXml $_ }

$body += ParaXml "7. Key User Flows" "Heading1"
$flows = @(
    @("7.1 New Catalogue Setup", @(
        "Upload catalogue master Excel/CSV or manually enter catalogue name, box size, and SKUs.",
        "Set catalogue refill ON/OFF for Delhi and Bangalore.",
        "Open catalogue dropdown and apply maximum/reorder values to the whole catalogue, then adjust individual SKUs if required.",
        "Turn SKU-level refill OFF where a specific pattern should not be refilled to a warehouse."
    )),
    @("7.2 Inventory Update", @(
        "Warehouse manager uploads latest inventory summary for Panipat, Delhi, and Bangalore.",
        "App updates current stock for the uploaded warehouse.",
        "Logs capture upload time and matched SKU count.",
        "In production, previous inventory snapshots should be stored for rollback and audit."
    )),
    @("7.3 Dispatch Planning", @(
        "Warehouse manager opens Dispatch Planning, selects Delhi or Bangalore.",
        "Reviews recommended shortage rows.",
        "Deselects SKUs not being sent in this SO.",
        "Exports selected CSV if needed.",
        "Enters SO number and confirms Pallet Ready.",
        "Later merges one or more pallet-ready SOs into a dispatch batch.",
        "When material is physically received, user manually clicks Mark as Received."
    ))
)
foreach ($f in $flows) {
    $body += ParaXml $f[0] "Heading2"
    foreach ($pt in $f[1]) { $body += BulletXml $pt }
}

$body += ParaXml "8. Data and Audit Requirements" "Heading1"
$body += TableXml @("Data Type","Production Requirement") @(
    @("Current stock","Latest inventory per warehouse and SKU."),
    @("Inventory upload history","Every upload stored with user, warehouse, timestamp, file metadata, matched/missing SKU count."),
    @("Catalogue master","Catalogue, SKU, box size, active status, created/updated metadata."),
    @("Refill settings","Catalogue-level and SKU-level warehouse ON/OFF, max, reorder 1, reorder 2."),
    @("Pallet-ready SOs","SO number, destination, selected SKUs, boxes, rolls, creator, timestamp, status."),
    @("Dispatch batches","Batch ID, destination, SO numbers, lines, ETA, status, received metadata."),
    @("Logs","All important actions, errors, issue reports, and configuration changes.")
)

$body += ParaXml "9. Firebase Production Build Plan" "Heading1"
$body += ParaXml "The production version should be built as a Firebase-backed module inside the existing Fedora multi-app dashboard."
$body += TableXml @("Firebase Component","Usage") @(
    @("Firebase Hosting","Host the production web app/module."),
    @("Firebase Authentication","User login and session management."),
    @("Firestore","Central database for catalogues, stock, SOs, dispatches, settings, logs, and issue reports."),
    @("Firebase Storage","Store uploaded Excel files and optional issue screenshots."),
    @("Cloud Functions","Process imports, validate data, run protected calculations, send notifications."),
    @("Cloud Logging / Error Monitoring","Track crashes, failed uploads, runtime errors, and performance issues.")
)

$body += ParaXml "10. Suggested Firestore Collections" "Heading1"
$body += TableXml @("Collection","Purpose") @(
    @("users","User profiles, roles, assigned warehouses."),
    @("catalogues","Catalogue-level records and refill settings."),
    @("skus","SKU master records with box size and catalogue reference."),
    @("skuWarehouseSettings","Per SKU, per warehouse max/reorder/refill ON-OFF settings."),
    @("inventoryCurrent","Latest stock by warehouse and SKU."),
    @("inventoryUploads","Upload history, file metadata, matched/missing SKU counts."),
    @("palletReadySOs","Pallet-ready sales orders and line items."),
    @("dispatchBatches","Dispatch batch records and received status."),
    @("activityLogs","All user actions and system events."),
    @("issueReports","Reported issues from users with page/context.")
)

$body += ParaXml "11. Security and Permissions" "Heading1"
@(
    "Every user must log in.",
    "Role-based access should control who can upload inventory, edit settings, create SOs, mark received, void SOs, and view logs.",
    "Firestore security rules must prevent direct unauthorized changes.",
    "Important actions should write audit logs with user ID, timestamp, old value, and new value where applicable.",
    "Production should have daily automated backups and a rollback process for wrong inventory uploads."
) | ForEach-Object { $body += BulletXml $_ }

$body += ParaXml "12. Error Monitoring and Issue Handling" "Heading1"
@(
    "Add production error monitoring to capture page, user, warehouse, action, browser, app version, and error details.",
    "Report Issue should save the issue to Firestore and notify admin.",
    "Failed uploads should generate visible user error and admin log.",
    "Admin should see issue reports and recent errors in the main dashboard or Logs module.",
    "Future alert channels can include email, WhatsApp API, or Slack depending on company preference."
) | ForEach-Object { $body += BulletXml $_ }

$body += ParaXml "13. Reliability and Performance Plan" "Heading1"
@(
    "Use paginated or virtualized tables for 1,500+ SKUs and future growth.",
    "Do not render every historical record on the first screen.",
    "Validate Excel uploads before replacing inventory.",
    "Keep staging and production environments separate.",
    "Add automated tests for recommendation logic, refill ON/OFF logic, SO creation, dispatch batch creation, mark received, and upload parsing.",
    "Use app versioning so bugs can be traced to a release."
) | ForEach-Object { $body += BulletXml $_ }

$body += ParaXml "14. Implementation Phases" "Heading1"
$body += TableXml @("Phase","Scope") @(
    @("Phase 1 - Approval","Review prototype, finalize PRD, confirm role permissions and data model."),
    @("Phase 2 - Firebase Foundation","Set up Firebase project, auth, hosting, Firestore rules, app module shell."),
    @("Phase 3 - Core Data","Build catalogue master, SKU settings, inventory upload, logs."),
    @("Phase 4 - Dispatch Workflow","Build recommendations, pallet-ready SOs, dispatch batches, mark received, exports."),
    @("Phase 5 - Safety","Add issue reporting, error monitoring, backups, upload validation, audit trails."),
    @("Phase 6 - UAT","Test with real warehouse files and selected users."),
    @("Phase 7 - Production","Deploy inside Fedora main app dashboard with monitoring and backup enabled.")
)

$body += ParaXml "15. Open Decisions for Senior Review" "Heading1"
@(
    "Which users should be allowed to edit catalogue and SKU refill settings?",
    "Should inventory upload require admin approval before replacing current stock?",
    "Should uploaded Excel originals be stored permanently in Firebase Storage?",
    "What alert channel should be used for issue reports and critical errors?",
    "What backup retention period is required?",
    "Should the system integrate directly with Zoho later, or continue using Excel uploads for now?"
) | ForEach-Object { $body += BulletXml $_ }

$body += ParaXml "16. Recommendation" "Heading1"
$body += ParaXml "The prototype should now be frozen for business review. After senior approval, the next step is to build the Firebase production module with central database, login, audit logs, backups, error monitoring, and staging/production deployment."

$styles = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="BodyText"><w:name w:val="Body Text"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:qFormat/><w:pPr><w:spacing w:before="240" w:after="180"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:color w:val="1F4E79"/><w:sz w:val="36"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:qFormat/><w:pPr><w:spacing w:after="180"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:color w:val="5B677A"/><w:sz w:val="24"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="BodyText"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="300" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:color w:val="1F4E79"/><w:sz w:val="28"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="BodyText"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="180" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:color w:val="2F5597"/><w:sz w:val="24"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="TableHeader"><w:name w:val="Table Header"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:color w:val="1F4E79"/><w:sz w:val="20"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="TableBody"><w:name w:val="Table Body"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="20"/></w:rPr></w:style>
  <w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/></w:style>
</w:styles>
"@

$document = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    $body
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>
  </w:body>
</w:document>
"@

$contentTypes = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>
"@

$rels = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
"@

$docRels = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>
"@

$out = Join-Path (Get-Location) "Fedora Inventory Management - Final PRD and Firebase Build Plan - CLEAN.docx"
$tmp = Join-Path (Get-Location) ".tmp_clean_prd_docx"
if (Test-Path $tmp) { Remove-Item -LiteralPath $tmp -Recurse -Force }
New-Item -ItemType Directory -Path (Join-Path $tmp "_rels") | Out-Null
New-Item -ItemType Directory -Path (Join-Path $tmp "word\_rels") | Out-Null
Set-Content -LiteralPath (Join-Path $tmp "[Content_Types].xml") -Value $contentTypes -Encoding UTF8
Set-Content -LiteralPath (Join-Path $tmp "_rels\.rels") -Value $rels -Encoding UTF8
Set-Content -LiteralPath (Join-Path $tmp "word\document.xml") -Value $document -Encoding UTF8
Set-Content -LiteralPath (Join-Path $tmp "word\styles.xml") -Value $styles -Encoding UTF8
Set-Content -LiteralPath (Join-Path $tmp "word\_rels\document.xml.rels") -Value $docRels -Encoding UTF8
if (Test-Path $out) { Remove-Item -LiteralPath $out -Force }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($tmp, $out)
Write-Output $out
