# SAFE-A JPEG laboratory analysis

Frozen SAFE-A threshold: `0.5864923000335693`.

The scored matrix contains `2140` descendants: `1300` Pillow quality-sweep rows, `120` Sharp subsampling rows, and `540` bounded compound rows.

## Quality sweep

| Requested quality | N | Synthetic recall | Negative FPR | Median score delta |
| ---: | ---: | ---: | ---: | ---: |
| 100 | 100 | 0.0 | 0.016666666666666666 | -0.11150714568793774 |
| 99 | 100 | 0.025 | 0.016666666666666666 | -0.1583608239889145 |
| 98 | 100 | 0.025 | 0.08333333333333333 | -0.07584532164037228 |
| 97 | 100 | 0.0 | 0.13333333333333333 | -0.02328325528651476 |
| 96 | 100 | 0.0 | 0.13333333333333333 | -0.011782526969909668 |
| 95 | 100 | 0.0 | 0.13333333333333333 | -0.016253456473350525 |
| 92 | 100 | 0.0 | 0.1 | -0.024800090119242668 |
| 90 | 100 | 0.0 | 0.1 | -0.030164433643221855 |
| 85 | 100 | 0.0 | 0.1 | -0.026085862889885902 |
| 80 | 100 | 0.0 | 0.1 | -0.03285952564328909 |
| 75 | 100 | 0.0 | 0.1 | -0.07845531776547432 |
| 65 | 100 | 0.0 | 0.1 | -0.04347137548029423 |
| 50 | 100 | 0.0 | 0.1 | -0.08215688169002533 |

## Encoder and compound summaries

```json
{
  "byEncoder": {
    "PILLOW_LIBJPEG": {
      "falsePositives": 108,
      "maxRawScore": 0.9940518736839294,
      "medianOriginalRawScore": 0.47324439883232117,
      "medianRawScore": 0.046659015119075775,
      "medianScoreDelta": -0.3480123393237591,
      "minRawScore": 0.006256663240492344,
      "n": 2020,
      "negativeFpr": 0.10588235294117647,
      "negativeFprWilson95": {
        "lower": 0.08845622233579477,
        "upper": 0.12626594673315192
      },
      "negativeN": 1020,
      "originalPassToDescendantMiss": 948,
      "sourceFamilies": 100,
      "syntheticDetected": 4,
      "syntheticN": 1000,
      "syntheticRecall": 0.004,
      "syntheticRecallWilson95": {
        "lower": 0.001556588140408431,
        "upper": 0.010239556277262253
      }
    },
    "SHARP_LIBVIPS": {
      "falsePositives": 6,
      "maxRawScore": 0.9893206357955933,
      "medianOriginalRawScore": 0.9257996380329132,
      "medianRawScore": 0.05068403482437134,
      "medianScoreDelta": -0.848071526736021,
      "minRawScore": 0.011790537275373936,
      "n": 120,
      "negativeFpr": 0.15,
      "negativeFprWilson95": {
        "lower": 0.07061187717320361,
        "upper": 0.29072324366489705
      },
      "negativeN": 40,
      "originalPassToDescendantMiss": 76,
      "sourceFamilies": 60,
      "syntheticDetected": 0,
      "syntheticN": 80,
      "syntheticRecall": 0.0,
      "syntheticRecallWilson95": {
        "lower": 0.0,
        "upper": 0.0458181295355271
      }
    }
  },
  "compoundByOperation": {
    "JPEG75_TO_JPEG95": {
      "falsePositives": 3,
      "maxRawScore": 0.9248902201652527,
      "medianOriginalRawScore": 0.9257996380329132,
      "medianRawScore": 0.043078234419226646,
      "medianScoreDelta": -0.8731158636510372,
      "minRawScore": 0.010011499747633934,
      "n": 60,
      "negativeFpr": 0.15,
      "negativeFprWilson95": {
        "lower": 0.05236874589621659,
        "upper": 0.36041886474075696
      },
      "negativeN": 20,
      "originalPassToDescendantMiss": 38,
      "sourceFamilies": 60,
      "syntheticDetected": 0,
      "syntheticN": 40,
      "syntheticRecall": 0.0,
      "syntheticRecallWilson95": {
        "lower": 0.0,
        "upper": 0.08762160119728664
      }
    },
    "JPEG85_TO_JPEG95": {
      "falsePositives": 3,
      "maxRawScore": 0.7960808277130127,
      "medianOriginalRawScore": 0.9257996380329132,
      "medianRawScore": 0.04259680025279522,
      "medianScoreDelta": -0.8507760632783175,
      "minRawScore": 0.014064136892557144,
      "n": 60,
      "negativeFpr": 0.15,
      "negativeFprWilson95": {
        "lower": 0.05236874589621659,
        "upper": 0.36041886474075696
      },
      "negativeN": 20,
      "originalPassToDescendantMiss": 38,
      "sourceFamilies": 60,
      "syntheticDetected": 0,
      "syntheticN": 40,
      "syntheticRecall": 0.0,
      "syntheticRecallWilson95": {
        "lower": 0.0,
        "upper": 0.08762160119728664
      }
    },
    "JPEG95_TO_JPEG85": {
      "falsePositives": 3,
      "maxRawScore": 0.9333190321922302,
      "medianOriginalRawScore": 0.9257996380329132,
      "medianRawScore": 0.04500150494277477,
      "medianScoreDelta": -0.863730676472187,
      "minRawScore": 0.012299472466111183,
      "n": 60,
      "negativeFpr": 0.15,
      "negativeFprWilson95": {
        "lower": 0.05236874589621659,
        "upper": 0.36041886474075696
      },
      "negativeN": 20,
      "originalPassToDescendantMiss": 38,
      "sourceFamilies": 60,
      "syntheticDetected": 0,
      "syntheticN": 40,
      "syntheticRecall": 0.0,
      "syntheticRecallWilson95": {
        "lower": 0.0,
        "upper": 0.08762160119728664
      }
    },
    "JPEG95_TO_RESIZE75": {
      "falsePositives": 3,
      "maxRawScore": 0.9409330487251282,
      "medianOriginalRawScore": 0.9257996380329132,
      "medianRawScore": 0.04059414193034172,
      "medianScoreDelta": -0.8703212020918727,
      "minRawScore": 0.015765370801091194,
      "n": 60,
      "negativeFpr": 0.15,
      "negativeFprWilson95": {
        "lower": 0.05236874589621659,
        "upper": 0.36041886474075696
      },
      "negativeN": 20,
      "originalPassToDescendantMiss": 38,
      "sourceFamilies": 60,
      "syntheticDetected": 0,
      "syntheticN": 40,
      "syntheticRecall": 0.0,
      "syntheticRecallWilson95": {
        "lower": 0.0,
        "upper": 0.08762160119728664
      }
    },
    "JPEG_TO_PNG": {
      "falsePositives": 6,
      "maxRawScore": 0.9893206357955933,
      "medianOriginalRawScore": 0.9257996380329132,
      "medianRawScore": 0.04721112921833992,
      "medianScoreDelta": -0.8297293074429035,
      "minRawScore": 0.011913606896996498,
      "n": 60,
      "negativeFpr": 0.3,
      "negativeFprWilson95": {
        "lower": 0.14547724486760433,
        "upper": 0.5189728183535235
      },
      "negativeN": 20,
      "originalPassToDescendantMiss": 38,
      "sourceFamilies": 60,
      "syntheticDetected": 0,
      "syntheticN": 40,
      "syntheticRecall": 0.0,
      "syntheticRecallWilson95": {
        "lower": 0.0,
        "upper": 0.08762160119728664
      }
    },
    "NON8_CROP_TO_JPEG95": {
      "falsePositives": 3,
      "maxRawScore": 0.9873039126396179,
      "medianOriginalRawScore": 0.9257996380329132,
      "medianRawScore": 0.05504913255572319,
      "medianScoreDelta": -0.8508974481374025,
      "minRawScore": 0.012746676802635193,
      "n": 60,
      "negativeFpr": 0.15,
      "negativeFprWilson95": {
        "lower": 0.05236874589621659,
        "upper": 0.36041886474075696
      },
      "negativeN": 20,
      "originalPassToDescendantMiss": 38,
      "sourceFamilies": 60,
      "syntheticDetected": 0,
      "syntheticN": 40,
      "syntheticRecall": 0.0,
      "syntheticRecallWilson95": {
        "lower": 0.0,
        "upper": 0.08762160119728664
      }
    },
    "RESIZE50_TO_JPEG95": {
      "falsePositives": 2,
      "maxRawScore": 0.967930257320404,
      "medianOriginalRawScore": 0.9257996380329132,
      "medianRawScore": 0.0397025179117918,
      "medianScoreDelta": -0.8503759503364563,
      "minRawScore": 0.006256663240492344,
      "n": 60,
      "negativeFpr": 0.1,
      "negativeFprWilson95": {
        "lower": 0.02786648121376822,
        "upper": 0.3010336452284873
      },
      "negativeN": 20,
      "originalPassToDescendantMiss": 38,
      "sourceFamilies": 60,
      "syntheticDetected": 0,
      "syntheticN": 40,
      "syntheticRecall": 0.0,
      "syntheticRecallWilson95": {
        "lower": 0.0,
        "upper": 0.08762160119728664
      }
    },
    "RESIZE75_TO_JPEG95": {
      "falsePositives": 3,
      "maxRawScore": 0.9442854523658752,
      "medianOriginalRawScore": 0.9257996380329132,
      "medianRawScore": 0.041132980957627296,
      "medianScoreDelta": -0.8526369668543339,
      "minRawScore": 0.01526954397559166,
      "n": 60,
      "negativeFpr": 0.15,
      "negativeFprWilson95": {
        "lower": 0.05236874589621659,
        "upper": 0.36041886474075696
      },
      "negativeN": 20,
      "originalPassToDescendantMiss": 38,
      "sourceFamilies": 60,
      "syntheticDetected": 1,
      "syntheticN": 40,
      "syntheticRecall": 0.025,
      "syntheticRecallWilson95": {
        "lower": 0.004426831502681404,
        "upper": 0.1288136896347409
      }
    },
    "SCREENSHOT_STYLE_TO_JPEG95": {
      "falsePositives": 2,
      "maxRawScore": 0.9646450281143188,
      "medianOriginalRawScore": 0.9257996380329132,
      "medianRawScore": 0.03900727070868015,
      "medianScoreDelta": -0.8629355654120445,
      "minRawScore": 0.012456249445676804,
      "n": 60,
      "negativeFpr": 0.1,
      "negativeFprWilson95": {
        "lower": 0.02786648121376822,
        "upper": 0.3010336452284873
      },
      "negativeN": 20,
      "originalPassToDescendantMiss": 38,
      "sourceFamilies": 60,
      "syntheticDetected": 1,
      "syntheticN": 40,
      "syntheticRecall": 0.025,
      "syntheticRecallWilson95": {
        "lower": 0.004426831502681404,
        "upper": 0.1288136896347409
      }
    }
  },
  "sharpBySubsampling": {
    "4:2:0": {
      "falsePositives": 6,
      "maxRawScore": 0.9893206357955933,
      "medianOriginalRawScore": 0.9257996380329132,
      "medianRawScore": 0.04584093391895294,
      "medianScoreDelta": -0.8297293074429035,
      "minRawScore": 0.011913606896996498,
      "n": 60,
      "negativeFpr": 0.3,
      "negativeFprWilson95": {
        "lower": 0.14547724486760433,
        "upper": 0.5189728183535235
      },
      "negativeN": 20,
      "originalPassToDescendantMiss": 38,
      "sourceFamilies": 60,
      "syntheticDetected": 0,
      "syntheticN": 40,
      "syntheticRecall": 0.0,
      "syntheticRecallWilson95": {
        "lower": 0.0,
        "upper": 0.08762160119728664
      }
    },
    "4:4:4": {
      "falsePositives": 0,
      "maxRawScore": 0.34553954005241394,
      "medianOriginalRawScore": 0.9257996380329132,
      "medianRawScore": 0.053022442385554314,
      "medianScoreDelta": -0.8487603291869164,
      "minRawScore": 0.011790537275373936,
      "n": 60,
      "negativeFpr": 0.0,
      "negativeFprWilson95": {
        "lower": 0.0,
        "upper": 0.16112515805281938
      },
      "negativeN": 20,
      "originalPassToDescendantMiss": 38,
      "sourceFamilies": 60,
      "syntheticDetected": 0,
      "syntheticN": 40,
      "syntheticRecall": 0.0,
      "syntheticRecallWilson95": {
        "lower": 0.0,
        "upper": 0.08762160119728664
      }
    }
  }
}
```

Sharp/libvips did not support the requested 4:2:2 mode in the installed path; that omission is recorded rather than silently represented as a result.

This artifact reports bounded laboratory behaviour, not population-level FPR or universal JPEG claims.
