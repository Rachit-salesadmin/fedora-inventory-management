# Inventory Management App

Responsive browser app for wallpaper warehouse transfer planning across Panipat, Delhi, and Bangalore.

## How to open

Open `index.html` in a browser.

No install step is required for this first version.

## What is included

- Catalogue master entry with catalogue name, box size, and SKU/pattern numbers.
- Separate Panipat, Delhi, and Bangalore inventory uploads using CSV/TSV text.
- Stock calculations based on `quantity_available_ for_ sale`.
- Default 2-box maximum/target levels with bulk apply.
- Per-SKU custom maximums for high-selling patterns.
- Shortage recommendations using actual stock + Pallet Ready + In Transit.
- Pallet Ready sales order creation.
- Dispatch Batch creation such as `DB-001`.
- One destination per Dispatch Batch.
- Merged SKU totals inside dispatch batches while preserving SO numbers.
- Delhi and Bangalore shortage CSV exports.

## Upload format

Catalogue master imports support `.xlsx`, `.csv`, and `.tsv` files with these columns:

```csv
catalogue,sku,box_size
Canvas,81369-1,12
Canvas,81369-2,12
```

Inventory uploads support `.xlsx`, `.csv`, and `.tsv` files with these columns:

```csv
sku,quantity_available_ for_ sale
123454,16
123455,8
```

Direct Zoho sync is planned as a future upgrade.
