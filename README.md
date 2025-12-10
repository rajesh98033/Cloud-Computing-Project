# Serverless Photo-Processing Service
This project is a fully serverless image analysis pipeline built using Google Cloud Platform.
Users upload an image through a simple web UI, and the backend processes it using Cloud Run, Cloud Storage, Firestore, Eventarc, and Vision API. The UI then displays the results, including detected labels and summary information.

The architecture is event-driven and completely serverless, designed to scale automatically with no manual server management.
