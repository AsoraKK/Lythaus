# Phase/DCT real-media analysis

The measurements are descriptive EF4 candidates only; no classifier or threshold was fitted.

Rows: `2240` (`100` originals and `2140` descendants). Known-answer fixtures passed: `True`.

## JPEG95 feature separation

| Feature | Oriented AUC | Synthetic median | Genuine median | Median difference |
| --- | ---: | ---: | ---: | ---: |
| fftLogMagnitudeMean | 0.7183333333333333 | 2.137390345392631 | 1.7097527825720253 | 0.4276375628206055 |
| fftHighFrequencyEnergyRatio | 0.6074999999999999 | 0.027674335363563035 | 0.035553326517202014 | -0.007878991153638978 |
| fftPhaseCircularCoherence | 0.5245833333333334 | 0.01094990271442246 | 0.009705057103032301 | 0.0012448456113901586 |
| fftPhaseMeanAbsolute | 0.6154166666666667 | 1.5763018975198348 | 1.5693348191105696 | 0.006967078409265248 |
| dctDcMean | 0.5829166666666666 | 3.2407743566176475 | 3.7897240732230397 | -0.5489497166053923 |
| dctDcStd | 0.7445833333333333 | 1.5022504893629098 | 0.7974097750888902 | 0.7048407142740196 |
| dctAcL1Mean | 0.7062499999999999 | 0.029897316714579923 | 0.014863437907420271 | 0.015033878807159652 |
| dctAcEnergy | 0.6916666666666668 | 0.007649500531485573 | 0.003053463575323665 | 0.004596036956161908 |
| dctLowFrequencyEnergy | 0.7116666666666667 | 0.042694544868877096 | 0.017540283942890776 | 0.02515426092598632 |
| dctHighFrequencyEnergy | 0.6475000000000001 | 0.0005280452508791606 | 0.00023239996202162075 | 0.00029564528885753986 |
| dctHighToLowEnergyRatio | 0.51 | 0.014178452199166192 | 0.01236025701544681 | 0.0018181951837193816 |
| dctAcZeroRate | 0.6541666666666667 | 0.3229089161706349 | 0.4714704241071429 | -0.14856150793650802 |
| blockBoundaryRatio | 0.5933333333333333 | 1.0100610548655677 | 1.060652106706494 | -0.05059105184092627 |
| pixelStd | 0.7304166666666667 | 0.20939638141290584 | 0.14548211323510735 | 0.0639142681777985 |

## Interpretation boundary

This run measures the SAFE-easy JPEG laboratory and the corresponding camera/digital controls. Seedream-4 and Imagen-4 transformed descendants were not silently substituted; they require a separately frozen supplemental cohort before claims about phase/DCT rescue of those misses.

Phase/DCT stability is not authenticity evidence by itself; separation and unique-rescue analyses are required before promotion.
