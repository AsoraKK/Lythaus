# Lythaus forensic-model scope

Lythaus Authenticity AI is being developed as a **FORENSIC_CLASSIFIER_AND_EVIDENCE_MEASUREMENT_SYSTEM**. It is not a generative image model. It does not synthesize images, generate replacement visual content, recreate another provider's image-generation capability, imitate a generator's style, distill generator weights, expose text-to-image or image-to-image generation, or produce media as its model output.

Its intended function is approximately:

```text
image pixels -> independent forensic measurements -> evidence regarding synthetic-origin indicators -> calibrated confidence/applicability -> the Lythaus evidence system
```

Expected outputs are measurements such as rawScore, normalizedMeasurement, applicability, confidence, limitations, and forensic evidence features. The WP007A target truth axis is **syntheticDepictedContent**. It remains independent from **physicalCameraAcquisition**; digital non-AI graphics and screenshots are not synthetic merely because they are non-camera artifacts.

This is a functional/technical classification, not a legal conclusion. Technical model classification and provider-specific use rights are recorded separately. No statement here establishes that every provider output may be used for training.
