$out = Join-Path (Get-Location) 'AI Website Tools Guide for Business.pdf'

$text = @'
AI Tools, Hosting, and Domain Guide for a Professional Business Website

Short Recommendation
For a serious business website, the best practical choice is usually one of these two paths:
1. Easy website builder: Wix, Squarespace, Framer, or Webflow. This is best if you want to edit everything yourself without technical work.
2. Custom website: Build the website as normal website code, then host it on Netlify, Vercel, Cloudflare Pages, or another hosting service. This is best if you want more ownership, flexibility, and lower long-term cost.

My suggested option for most small and medium business websites is: custom website + Netlify/Vercel/Cloudflare Pages hosting + your own .com domain.

Best AI Website Tools
Wix AI: Easiest for beginners. It includes hosting, templates, AI tools, and custom domain support on paid plans. Good for simple business websites.
Framer: Very good for modern, polished websites. Best for visually clean brand or company websites.
Webflow: Best for high-end custom design, but harder to learn. Often used by agencies and professional designers.
Squarespace: Good for service businesses, portfolios, restaurants, salons, creators, and simple company websites.
Shopify: Best if the main purpose of the website is online selling or ecommerce.
WordPress: Powerful and flexible, but it needs more maintenance and setup.

Will the Website Work After the Monthly Subscription Ends?
If the website is made with Wix, Squarespace, Framer, or Webflow, the website usually depends on their paid plan for professional features such as custom domain, no platform branding, forms, CMS, ecommerce, and publishing.

If you stop paying, the website may still remain inside your account, but the proper business website may stop working correctly, lose the custom domain connection, show platform branding, or become limited.

If the website is built as normal website code and hosted separately, you do not need to keep paying an AI website builder subscription for the website to continue working. You mainly pay for the domain name, hosting if needed, and optional business email.

What a Website Needs
A website needs three main things:
1. Website files: the pages, text, images, design, forms, and buttons.
2. Hosting: the online space where the website lives.
3. Domain name: the address people type, such as www.yourbusiness.com.

Important: What Does www.com Mean?
You do not register a website at www.com. Instead, you register a domain name ending in .com, such as yourbusiness.com.

The www part is only a subdomain. For example, your main domain is yourbusiness.com, and www.yourbusiness.com points to the same website.

Hosting and Domain Procedure
1. Choose a domain name, for example yourbusiness.com.
2. Register the domain from a domain registrar such as Cloudflare, Namecheap, GoDaddy, or Squarespace Domains.
3. Build the website.
4. Upload or deploy the website to hosting, such as Netlify, Vercel, Cloudflare Pages, Webflow, Wix, or Framer.
5. Connect the domain to the hosting using DNS settings.
6. Enable SSL so the website opens with https://.
7. Add Google Search Console so Google can index the website.

Approximate Charges
These are approximate costs and can change depending on the provider, country, plan, and offers:
.com domain: usually around Rs. 1,000 to Rs. 2,000 per year.
Basic hosting for a custom static business website: can be free on Netlify, Vercel, or Cloudflare Pages for small websites.
Paid hosting: often around Rs. 700 to Rs. 2,000+ per month depending on provider and features.
Wix, Framer, Webflow, or Squarespace: usually monthly or yearly subscription plans. The cost depends on the plan and features.
Business email such as info@yourbusiness.com: usually around Rs. 150 to Rs. 800+ per user per month depending on provider.

If the Website Is Made Through Codex/ChatGPT
The procedure would be:
1. Share business name, logo, services/products, contact number, WhatsApp number, address, photos, preferred colors, and reference websites.
2. The website is designed and built as normal website code.
3. The website is previewed and corrected before publishing.
4. The website is deployed to Netlify, Vercel, or Cloudflare Pages.
5. A .com domain is purchased separately from a domain registrar.
6. The domain is connected to the hosting.
7. SSL is enabled so the website is secure.
8. Google Search Console and basic analytics can be added.

Final Suggested Setup
For a professional business website with low long-term cost and better ownership, the best setup is:
- Custom website built as normal code.
- Hosting on Netlify, Vercel, or Cloudflare Pages.
- Domain purchased from Cloudflare, Namecheap, GoDaddy, or another registrar.
- Optional business email from Zoho Mail, Google Workspace, or Microsoft 365.

This way, the website does not depend on paying a monthly AI website builder subscription forever. The main yearly cost is the domain name, and hosting can often remain free for a simple business website.
'@

function Escape-PdfText([string]$value) {
    return $value.Replace('\', '\\').Replace('(', '\(').Replace(')', '\)')
}

function Wrap-Line([string]$line, [int]$maxLength) {
    if ([string]::IsNullOrWhiteSpace($line)) {
        return @('')
    }

    $words = $line -split ' '
    $result = New-Object System.Collections.Generic.List[string]
    $current = ''

    foreach ($word in $words) {
        if ($current.Length -eq 0) {
            $current = $word
        }
        elseif (($current.Length + 1 + $word.Length) -le $maxLength) {
            $current = "$current $word"
        }
        else {
            $result.Add($current)
            $current = $word
        }
    }

    if ($current.Length -gt 0) {
        $result.Add($current)
    }

    return $result.ToArray()
}

$allLines = New-Object System.Collections.Generic.List[string]
foreach ($rawLine in ($text -split "`n")) {
    $line = $rawLine.TrimEnd("`r")
    foreach ($wrappedLine in (Wrap-Line $line 86)) {
        $allLines.Add($wrappedLine)
    }
}

$linesPerPage = 48
$pages = New-Object System.Collections.Generic.List[object]
for ($i = 0; $i -lt $allLines.Count; $i += $linesPerPage) {
    $end = [Math]::Min($i + $linesPerPage - 1, $allLines.Count - 1)
    $pages.Add($allLines[$i..$end])
}

$sectionHeadings = @{
    'Short Recommendation' = $true
    'Best AI Website Tools' = $true
    'Will the Website Work After the Monthly Subscription Ends?' = $true
    'What a Website Needs' = $true
    'Important: What Does www.com Mean?' = $true
    'Hosting and Domain Procedure' = $true
    'Approximate Charges' = $true
    'If the Website Is Made Through Codex/ChatGPT' = $true
    'Final Suggested Setup' = $true
}

$objects = New-Object System.Collections.Generic.List[string]
$objects.Add('<< /Type /Catalog /Pages 2 0 R >>')
$pageRefs = New-Object System.Collections.Generic.List[string]

for ($pageIndex = 0; $pageIndex -lt $pages.Count; $pageIndex++) {
    $pageObjectNumber = 3 + ($pageIndex * 2)
    $contentObjectNumber = $pageObjectNumber + 1
    $pageRefs.Add("$pageObjectNumber 0 R")
    $objects.Add("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 999 0 R /F2 998 0 R >> >> /Contents $contentObjectNumber 0 R >>")

    $stream = New-Object System.Text.StringBuilder
    [void]$stream.Append("BT`n/F1 11 Tf`n50 750 Td`n14 TL`n")
    $first = $true

    foreach ($line in $pages[$pageIndex]) {
        if (-not $first) {
            [void]$stream.Append("T*`n")
        }
        $first = $false

        if ($line.Length -eq 0) {
            continue
        }

        if ($line -eq 'AI Tools, Hosting, and Domain Guide for a Professional Business Website') {
            [void]$stream.Append("/F2 14 Tf`n")
            [void]$stream.Append('(' + (Escape-PdfText $line) + ") Tj`n")
            [void]$stream.Append("/F1 11 Tf`n")
        }
        elseif ($sectionHeadings.ContainsKey($line)) {
            [void]$stream.Append("/F2 12 Tf`n")
            [void]$stream.Append('(' + (Escape-PdfText $line) + ") Tj`n")
            [void]$stream.Append("/F1 11 Tf`n")
        }
        else {
            [void]$stream.Append('(' + (Escape-PdfText $line) + ") Tj`n")
        }
    }

    [void]$stream.Append('ET')
    $content = $stream.ToString()
    $length = [System.Text.Encoding]::ASCII.GetByteCount($content)
    $objects.Add("<< /Length $length >>`nstream`n$content`nendstream")
}

$objects.Insert(1, "<< /Type /Pages /Kids [$($pageRefs -join ' ')] /Count $($pages.Count) >>")
$objects.Add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>')
$objects.Add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')

$boldFontObjectNumber = $objects.Count - 1
$regularFontObjectNumber = $objects.Count
for ($i = 0; $i -lt $objects.Count; $i++) {
    $objects[$i] = $objects[$i].Replace('999 0 R', "$regularFontObjectNumber 0 R").Replace('998 0 R', "$boldFontObjectNumber 0 R")
}

$pdf = New-Object System.Text.StringBuilder
[void]$pdf.Append("%PDF-1.4`n")
$offsets = New-Object System.Collections.Generic.List[int]

for ($i = 0; $i -lt $objects.Count; $i++) {
    $offsets.Add([System.Text.Encoding]::ASCII.GetByteCount($pdf.ToString()))
    [void]$pdf.Append("$($i + 1) 0 obj`n$($objects[$i])`nendobj`n")
}

$xrefOffset = [System.Text.Encoding]::ASCII.GetByteCount($pdf.ToString())
[void]$pdf.Append("xref`n0 $($objects.Count + 1)`n0000000000 65535 f `n")
foreach ($offset in $offsets) {
    [void]$pdf.Append(('{0:0000000000} 00000 n ' -f $offset) + "`n")
}
[void]$pdf.Append("trailer`n<< /Size $($objects.Count + 1) /Root 1 0 R >>`nstartxref`n$xrefOffset`n%%EOF")

[System.IO.File]::WriteAllBytes($out, [System.Text.Encoding]::ASCII.GetBytes($pdf.ToString()))
Get-Item -LiteralPath $out | Select-Object FullName, Length
