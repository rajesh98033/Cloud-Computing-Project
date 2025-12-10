const fileInput = document.getElementById("fileInput");
const chooseBtn = document.getElementById("chooseBtn");
const dropzone = document.getElementById("dropzone");
const analyzeBtn = document.getElementById("analyzeBtn");
const statusEl = document.getElementById("status");
const preview = document.getElementById("preview");
const previewImg = document.getElementById("previewImg");
const previewName = document.getElementById("previewName");
const previewSize = document.getElementById("previewSize");
let selectedFile = null;

const UPLOAD_API_URL = "https://upload-image-500866442605.us-central1.run.app";

let polling = false;
let currentFileId = null;

// Take the Firestore document and convert it to the shape the UI expects
function normalizeResult(raw) {
  const labels = (raw.labels || []).map((l) => ({
    desc: l.desc || l.description || "",
    score: l.score || 0,
  }));

  const metadata = {
  "File ID": raw.id || currentFileId || "",
  "File name": raw.name || "",
  "Bucket": raw.bucket || "",
  "Processed at": raw.processedAt || "",
  };

  return {
    labels,
    metadata,
    raw,
  };
}

// Poll the Cloud Run GET endpoint until we get the result for THIS file
async function pollForResult(expectedId, maxAttempts = 20, delayMs = 2000) {
  if (!expectedId) {
    console.error("pollForResult called without expectedId");
    showStatus("Missing file ID for polling.", "error");
    return;
  }

  if (polling) return;
  polling = true;
  console.log("Starting polling for result… expecting", expectedId);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(UPLOAD_API_URL); // GET /

      if (res.status === 404) {
        console.log(`Attempt ${attempt + 1}: no result yet (404)`);
      } else if (res.ok) {
        const raw = await res.json();
        console.log("Got analysis result:", raw);

        // If it's not the doc for THIS file, keep waiting
        if (!raw.id) {
          console.log(`Attempt ${attempt + 1}: doc has no id, keep polling`);
        } else if (raw.id !== expectedId) {
          console.log(
            `Attempt ${attempt + 1}: got id=${raw.id} but expected ${expectedId}; keep polling`
          );
        } else {
          const result = normalizeResult(raw);
          populateResults(result);
          showStatus("Analysis complete!", "ok");
          polling = false;
          return;
        }
      } else {
        console.log(`Attempt ${attempt + 1}: status ${res.status}`);
      }
    } catch (err) {
      console.error("Polling error:", err);
    }

    await new Promise((r) => setTimeout(r, delayMs));
  }

  polling = false;
  showStatus("Timed out waiting for analysis result.", "error");
}



chooseBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  handleFile(file);
});

// Drag & drop
["dragenter", "dragover"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add("dragover");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove("dragover");
  });
});

dropzone.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files[0];
  handleFile(file);
});

function handleFile(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showStatus("Please select an image file.", "error");
    return;
  }
  selectedFile = file;
  analyzeBtn.disabled = false;

  const sizeKB = (file.size / 1024).toFixed(1);
  previewImg.src = URL.createObjectURL(file);
  previewName.textContent = file.name;
  previewSize.textContent = `${sizeKB} KB`;
  preview.style.display = "flex";

  showStatus("Image ready to upload.", "ok");
}

// Tabs
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");

    const target = tab.dataset.tab;
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    document.getElementById("tab-" + target).classList.add("active");
  });
});

analyzeBtn.addEventListener("click", async () => {
  if (!selectedFile) return;

  //clear previous results
  populateResults({ labels: [], metadata: {}, raw: {} });
  showStatus("Uploading image to Cloud Storage…", "");
  analyzeBtn.disabled = true;

  try {
    // We send the raw file as the body, the backend reads req.rawBody
    const res = await fetch(UPLOAD_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": selectedFile.type || "application/octet-stream",
        "X-File-Name": encodeURIComponent(selectedFile.name),
      },
      body: selectedFile,
    });

    if (!res.ok) {
      throw new Error("Upload failed: " + res.status);
    }

    const data = await res.json();
    console.log("Uploaded file:", data.file);

    // The Firestore doc ID is the same as the GCS object name
    currentFileId = data.fileId || data.file;
    showStatus("Image uploaded! Waiting for Cloud Run analyzer…", "ok");

    // Start polling GET / for the latest Firestore result
    pollForResult(currentFileId);
  } catch (err) {
    console.error(err);
    showStatus("Upload error: " + err.message, "error");
  } finally {
    analyzeBtn.disabled = false;
  }
});

function showStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = "status";
  if (type === "ok") statusEl.classList.add("ok");
  else if (type === "error") statusEl.classList.add("error");
}

function populateResults(result) {
  // Summary labels
  const labelsEl = document.getElementById("summaryLabels");
  labelsEl.innerHTML = "";
  (result.labels || []).slice(0, 6).forEach((l) => {
    const div = document.createElement("div");
    div.className = "chip";
    div.textContent = `${l.desc} (${(l.score * 100).toFixed(0)}%)`;
    labelsEl.appendChild(div);
  });

  // Metadata table
  const metaBody = document.querySelector("#metadataTable tbody");
  metaBody.innerHTML = "";
  Object.entries(result.metadata || {}).forEach(([k, v]) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${k}</td><td>${v}</td>`;
    metaBody.appendChild(tr);
  });

  // Vision labels table
  const visBody = document.querySelector("#visionTable tbody");
  visBody.innerHTML = "";
  (result.labels || []).forEach((l) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${l.desc}</td><td>${(l.score * 100).toFixed(1)}%</td>`;
    visBody.appendChild(tr);
  });

  // Raw JSON tab
  document.getElementById("rawJson").textContent = JSON.stringify(
    result.raw || result,
    null,
    2
  );
}