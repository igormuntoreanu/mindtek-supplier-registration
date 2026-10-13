Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$outDir = Join-Path $root "webapp\localService\media"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function Convert-Color([string]$hex) {
	return [System.Drawing.ColorTranslator]::FromHtml($hex)
}

function New-Brush([string]$hex) {
	return New-Object System.Drawing.SolidBrush (Convert-Color $hex)
}

function Save-Bitmap($bitmap, [string]$name) {
	$path = Join-Path $outDir $name
	$bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
}

function New-DocumentCard {
	param(
		[string]$File,
		[string]$Title,
		[string]$Company,
		[string]$Reference,
		[string]$Status,
		[string]$Accent,
		[string]$Ink = "#1C2026",
		[string]$Stamp = "ON FILE"
	)
	if ($Stamp -eq "ON FILE" -and $Status -match "Not on file|Rejected|Not accepted|Outstanding|^Expired") {
		$Stamp = "GAP"
	}
	$bitmap = New-Object System.Drawing.Bitmap 960, 600
	$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
	$graphics.SmoothingMode = "AntiAlias"
	$graphics.TextRenderingHint = "AntiAliasGridFit"
	$graphics.Clear((Convert-Color "#F7F1E8"))
	$header = New-Brush $Accent
	$graphics.FillRectangle($header, 0, 0, 960, 18)
	$graphics.FillRectangle($header, 0, 582, 960, 18)
	$pen = New-Object System.Drawing.Pen (Convert-Color $Accent), 3
	$graphics.DrawRectangle($pen, 36, 42, 888, 516)
	$titleFont = New-Object System.Drawing.Font "Segoe UI", 28, ([System.Drawing.FontStyle]::Bold)
	$bodyFont = New-Object System.Drawing.Font "Segoe UI", 18
	$smallFont = New-Object System.Drawing.Font "Segoe UI", 13
	$inkBrush = New-Brush $Ink
	$graphics.DrawString($Title, $titleFont, $inkBrush, 64, 78)
	$graphics.DrawString($Company, $bodyFont, $inkBrush, 64, 168)
	$graphics.DrawString($Reference, $smallFont, $inkBrush, 64, 220)
	$graphics.DrawString($Status, $bodyFont, $header, 64, 300)
	$graphics.DrawString("Supplier file - specimen for registration review", $smallFont, $inkBrush, 64, 500)
	$graphics.DrawEllipse($pen, 720, 300, 150, 150)
	$stampFont = New-Object System.Drawing.Font "Segoe UI", 12, ([System.Drawing.FontStyle]::Bold)
	$format = New-Object System.Drawing.StringFormat
	$format.Alignment = "Center"
	$format.LineAlignment = "Center"
	$graphics.DrawString($Stamp, $stampFont, $header, (New-Object System.Drawing.RectangleF 720, 300, 150, 150), $format)
	Save-Bitmap $bitmap $File
	$graphics.Dispose()
	$bitmap.Dispose()
	$pen.Dispose()
	$header.Dispose()
	$inkBrush.Dispose()
	$titleFont.Dispose()
	$bodyFont.Dispose()
	$smallFont.Dispose()
	$stampFont.Dispose()
}

function New-LogoCard {
	param(
		[string]$File,
		[string]$Initials,
		[string]$Company,
		[string]$Accent
	)
	$bitmap = New-Object System.Drawing.Bitmap 640, 640
	$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
	$graphics.SmoothingMode = "AntiAlias"
	$graphics.TextRenderingHint = "AntiAliasGridFit"
	$graphics.Clear((Convert-Color $Accent))
	$white = New-Brush "#FFFFFF"
	$initialFont = New-Object System.Drawing.Font "Segoe UI", 92, ([System.Drawing.FontStyle]::Bold)
	$nameFont = New-Object System.Drawing.Font "Segoe UI", 22, ([System.Drawing.FontStyle]::Bold)
	$format = New-Object System.Drawing.StringFormat
	$format.Alignment = "Center"
	$format.LineAlignment = "Center"
	$graphics.DrawString($Initials, $initialFont, $white, (New-Object System.Drawing.RectangleF 40, 140, 560, 240), $format)
	$graphics.DrawString($Company, $nameFont, $white, (New-Object System.Drawing.RectangleF 48, 420, 544, 120), $format)
	Save-Bitmap $bitmap $File
	$graphics.Dispose()
	$bitmap.Dispose()
	$white.Dispose()
	$initialFont.Dispose()
	$nameFont.Dispose()
}

$companies = @(
	@{ Key = "helvetia"; Name = "Helvetia Motion AG"; Reg = "CHE-114.392.881"; Accent = "#0B3A66"; Initials = "HM"; Articles = "Extract of the commercial register, Zurich"; Tax = "VAT registration current"; Iso = "ISO 9001:2015 - valid to Nov 2026"; IsoStatus = "Certificate current" },
	@{ Key = "northsea"; Name = "Northsea Components Ltd"; Reg = "08441922"; Accent = "#1F4E5F"; Initials = "NC"; Articles = "Companies House incorporation"; Tax = "HMRC certificate of tax residence"; Iso = "ISO 9001:2015 - surveillance due"; IsoStatus = "Under surveillance review" },
	@{ Key = "serra"; Name = "Serra Verde Insumos Ltda"; Reg = "14.882.331/0001-09"; Accent = "#1E6B45"; Initials = "SV"; Articles = "Contrato social, Belo Horizonte"; Tax = "Cartão CNPJ and federal tax status"; Iso = "ISO 9001 not yet attached"; IsoStatus = "Not on file" },
	@{ Key = "baltic"; Name = "Baltic Forge OU"; Reg = "14588231"; Accent = "#6E2B2B"; Initials = "BF"; Articles = "Registry card, Tallinn"; Tax = "Expired 30 Sep 2022"; Iso = "Could not be validated"; IsoStatus = "Rejected" },
	@{ Key = "rheinwerk"; Name = "Rheinwerk Praezision GmbH"; Reg = "HRB 78221"; Accent = "#163A5F"; Initials = "RP"; Articles = "Handelsregister B, Stuttgart"; Tax = "Tax clearance current"; Iso = "ISO 9001:2015 - TUV Rheinland"; IsoStatus = "Certificate current" },
	@{ Key = "atlas"; Name = "Atlas Harbour Logistics B.V."; Reg = "64718293"; Accent = "#0E6E6E"; Initials = "AH"; Articles = "KvK extract, Rotterdam"; Tax = "VAT number NL64718293B01"; Iso = "ISO 9001:2015 - DNV"; IsoStatus = "Renewal in progress" },
	@{ Key = "cerrado"; Name = "Cerrado Alimentos S.A."; Reg = "07.441.209/0001-55"; Accent = "#8A5A12"; Initials = "CA"; Articles = "Estatuto social, Campinas"; Tax = "CNPJ active"; Iso = "ISO 9001:2015 - SGS"; IsoStatus = "Certificate current" },
	@{ Key = "pennine"; Name = "Pennine Alloys Ltd"; Reg = "11290844"; Accent = "#5C2E4A"; Initials = "PA"; Articles = "Companies House incorporation"; Tax = "Tax certificate older than the policy window"; Iso = "ISO 9001 not yet attached"; IsoStatus = "Not on file" }
)

foreach ($company in $companies) {
	New-DocumentCard -File "$($company.Key)-articles.png" -Title "ARTICLES OF INCORPORATION" -Company $company.Name -Reference $company.Reg -Status $company.Articles -Accent $company.Accent
	New-DocumentCard -File "$($company.Key)-tax.png" -Title "TAX CERTIFICATE" -Company $company.Name -Reference $company.Reg -Status $company.Tax -Accent $company.Accent
	$isoStamp = "ON FILE"
	if ($company.IsoStatus -eq "Not on file" -or $company.IsoStatus -eq "Rejected") { $isoStamp = "GAP" }
	New-DocumentCard -File "$($company.Key)-iso.png" -Title "ISO CERTIFICATION" -Company $company.Name -Reference $company.Iso -Status $company.IsoStatus -Accent $company.Accent -Stamp $isoStamp
	New-LogoCard -File "$($company.Key)-logo.png" -Initials $company.Initials -Company $company.Name -Accent $company.Accent
}

$extras = @(
	@{ File = "helvetia-insurance.png"; Title = "PUBLIC LIABILITY INSURANCE"; Company = "Helvetia Motion AG"; Reference = "Cover to 31 Mar 2027"; Status = "CHF 10 million"; Accent = "#0B3A66" },
	@{ File = "helvetia-bank.png"; Title = "BANK CONFIRMATION"; Company = "Helvetia Motion AG"; Reference = "UBS Switzerland AG"; Status = "Account confirmed"; Accent = "#0B3A66" },
	@{ File = "northsea-insurance.png"; Title = "PUBLIC LIABILITY INSURANCE"; Company = "Northsea Components Ltd"; Reference = "Cover to 30 Nov 2026"; Status = "GBP 5 million"; Accent = "#1F4E5F" },
	@{ File = "northsea-ownership.png"; Title = "BENEFICIAL OWNERSHIP"; Company = "Northsea Components Ltd"; Reference = "Awaiting signature"; Status = "Outstanding"; Accent = "#1F4E5F"; Stamp = "GAP" },
	@{ File = "serra-insurance.png"; Title = "PUBLIC LIABILITY INSURANCE"; Company = "Serra Verde Insumos Ltda"; Reference = "Cover to 30 Jun 2026"; Status = "Renewal due"; Accent = "#1E6B45" },
	@{ File = "baltic-environment.png"; Title = "ENVIRONMENTAL LICENCE"; Company = "Baltic Forge OU"; Reference = "Expired 30 Sep 2022"; Status = "Not accepted"; Accent = "#6E2B2B"; Stamp = "GAP" },
	@{ File = "rheinwerk-insurance.png"; Title = "PUBLIC LIABILITY INSURANCE"; Company = "Rheinwerk Praezision GmbH"; Reference = "Cover to 30 Jun 2027"; Status = "EUR 15 million"; Accent = "#163A5F" },
	@{ File = "rheinwerk-bank.png"; Title = "BANK CONFIRMATION"; Company = "Rheinwerk Praezision GmbH"; Reference = "Deutsche Bank"; Status = "Account confirmed"; Accent = "#163A5F" },
	@{ File = "atlas-insurance.png"; Title = "PUBLIC LIABILITY INSURANCE"; Company = "Atlas Harbour Logistics B.V."; Reference = "Expires 31 Oct 2026"; Status = "Renew before approval"; Accent = "#0E6E6E" },
	@{ File = "cerrado-insurance.png"; Title = "PUBLIC LIABILITY INSURANCE"; Company = "Cerrado Alimentos S.A."; Reference = "Cover to 31 Jan 2027"; Status = "BRL 20 million"; Accent = "#8A5A12" },
	@{ File = "cerrado-environment.png"; Title = "ENVIRONMENTAL LICENCE"; Company = "Cerrado Alimentos S.A."; Reference = "Campinas plant"; Status = "Valid to Aug 2027"; Accent = "#8A5A12" },
	@{ File = "cerrado-bank.png"; Title = "BANK CONFIRMATION"; Company = "Cerrado Alimentos S.A."; Reference = "Itaú Unibanco"; Status = "Account confirmed"; Accent = "#8A5A12" }
)

foreach ($extra in $extras) {
	$stamp = "ON FILE"
	if ($extra.Stamp) { $stamp = $extra.Stamp }
	New-DocumentCard -File $extra.File -Title $extra.Title -Company $extra.Company -Reference $extra.Reference -Status $extra.Status -Accent $extra.Accent -Stamp $stamp
}

Write-Host "Wrote previews to $outDir"
