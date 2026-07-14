# ImageJ cross-validation

This directory contains reusable scripts for comparing WB Gray Tool measurements with ImageJ on the same image and rectangular ROIs.

## Included

- `validate_against_imagej.py`: calculates Area, Mean and RawIntDen for fixed ROIs and compares them with an ImageJ CSV export.
- `imagej/compare_raw.ijm`: ImageJ macro for raw rectangular-ROI measurements.
- `imagej/compare_background.ijm`: ImageJ macro for the local-background method used by this tool.

## Local-only inputs

Validation source images, ImageJ binaries and generated measurement CSV files are intentionally excluded from Git. Put a test image at `validation/test.tif`, run the ImageJ macros, then run the Python comparison script.

The comparison is only meaningful when both tools use the same source pixels, ROI coordinates, signal polarity and background definition. It does not claim equivalence with ImageJ Gel Analyzer peak integration, rolling-ball subtraction or other analysis methods.
