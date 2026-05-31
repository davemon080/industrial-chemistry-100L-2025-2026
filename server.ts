import express from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { createServer as createViteServer } from "vite";
import webpush from "web-push";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, setDoc, doc, deleteDoc } from "firebase/firestore";

// Setup Firebase client instance on server matching firebase-applet-config
let db: any = null;
try {
  const appletConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(appletConfigPath)) {
    const appletConfig = JSON.parse(fs.readFileSync(appletConfigPath, "utf-8"));
    const firebaseConfig = {
      apiKey: appletConfig.apiKey || "AIzaSyDasXOCsqxwer5TJEkw8boKtnxk_KHCT0o",
      authDomain: appletConfig.authDomain || "ich100l.firebaseapp.com",
      projectId: appletConfig.projectId || "ich100l",
      storageBucket: appletConfig.storageBucket || "ich100l.firebasestorage.app",
      messagingSenderId: appletConfig.messagingSenderId || "957173852676",
      appId: appletConfig.appId || "1:957173852676:web:c87374af6a8e02afefa351",
      measurementId: appletConfig.measurementId || "G-X7T2126SDY"
    };
    const fbApp = initializeApp(firebaseConfig);
    db = getFirestore(fbApp, appletConfig.firestoreDatabaseId);
    console.log("[Server] Firebase Firestore offline-compatible client initialized successfully.");
  } else {
    console.warn("[Server] firebase-applet-config.json not found. Database features disabled on backend.");
  }
} catch (error) {
  console.error("[Server] Firebase Firestore initialization failed:", error);
}

// Utility matching client-side
function getSafeDocId(id: string): string {
  if (!id) return "";
  return id.trim().replace(/\//g, "-");
}

// Persist / load VAPID Keys dynamically so push subscription is not invalidated on restarts
const vapidPath = path.join(process.cwd(), "vapid-keys.json");
let vapidKeys: { publicKey: string; privateKey: string };

if (fs.existsSync(vapidPath)) {
  try {
    vapidKeys = JSON.parse(fs.readFileSync(vapidPath, "utf-8"));
  } catch (err) {
    console.error("[Server] Failed to read existing VAPID keys, generating new ones...");
    vapidKeys = webpush.generateVAPIDKeys();
    fs.writeFileSync(vapidPath, JSON.stringify(vapidKeys), "utf-8");
  }
} else {
  vapidKeys = webpush.generateVAPIDKeys();
  try {
    fs.writeFileSync(vapidPath, JSON.stringify(vapidKeys), "utf-8");
  } catch (err) {
    console.error("[Server] Failed to persist generated VAPID keys:", err);
  }
}

webpush.setVapidDetails(
  "mailto:daveimagodei@gmail.com",
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Ensure uploads directory exists and is statically served
  const uploadDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  app.use("/uploads", express.static(uploadDir));

  // Multer Storage Configuration (accepts files up to 100MB)
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const fileExt = path.extname(file.originalname).toLowerCase();
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, `${file.fieldname}-${uniqueSuffix}${fileExt}`);
    }
  });

  const upload = multer({
    storage,
    limits: {
      fileSize: 100 * 1024 * 1024, // 100MB Limit
    }
  });

  // Endpoints to support file uploads from device storage
  app.post("/api/upload-pdf", upload.single("pdf"), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No PDF file received." });
    }
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (ext !== ".pdf") {
      try {
        fs.unlinkSync(req.file.path);
      } catch (err) {}
      return res.status(400).json({ error: "Only .pdf files are permitted." });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ 
      success: true, 
      url: fileUrl, 
      filename: req.file.originalname 
    });
  });

  app.post("/api/upload-logo", upload.single("logo"), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No logo image file received." });
    }
    const ext = path.extname(req.file.originalname).toLowerCase();
    const allowed = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"];
    if (!allowed.includes(ext)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (err) {}
      return res.status(400).json({ 
        error: "Only PNG, JPG, JPEG, GIF, SVG, and WEBP images are allowed." 
      });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ success: true, url: fileUrl });
  });

  // Middleware for decoding incoming request bodies
  app.use(express.json());

  // Web Push API: Serve the VAPID public key
  app.get("/api/vapid-public-key", (req, res) => {
    res.json({ publicKey: vapidKeys.publicKey });
  });

  // Web Push API: Save push subscription durably in Firestore
  app.post("/api/push-subscribe", async (req, res) => {
    const { subscription, matricNumber } = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: "Subscription payload with endpoint is required." });
    }

    if (!db) {
      return res.status(500).json({ error: "Backend database connection is offline. Please try again." });
    }

    try {
      // Create a stable, unique document ID based on the subscription endpoint hash to allow multiple devices/browsers per student
      const endpointHash = Buffer.from(subscription.endpoint).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(-60);
      const docId = getSafeDocId(`${matricNumber || "Guest"}-${endpointHash}`);

      await setDoc(doc(db, "push-subscriptions", docId), {
        subscription,
        matricNumber: matricNumber || "Guest",
        endpoint: subscription.endpoint,
        createdAt: new Date().toISOString()
      });
      res.json({ success: true });
    } catch (error: any) {
      console.error("[Server] Subscribe persistence error:", error);
      res.status(500).json({ error: error.message || "Could not save push subscription." });
    }
  });

  // Web Push API: Remove push subscription from Firestore
  app.post("/api/push-unsubscribe", async (req, res) => {
    const { subscription, matricNumber } = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: "Subscription payload with endpoint is required." });
    }

    if (!db) {
      return res.status(500).json({ error: "Backend database connection is offline." });
    }

    try {
      const endpointHash = Buffer.from(subscription.endpoint).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(-60);
      const docId = getSafeDocId(`${matricNumber || "Guest"}-${endpointHash}`);
      await deleteDoc(doc(db, "push-subscriptions", docId));
      res.json({ success: true });
    } catch (error: any) {
      console.error("[Server] Unsubscribe error:", error);
      res.status(500).json({ error: error.message || "Could not remove subscription." });
    }
  });

  // Web Push API: Broadcast offline background notification alert
  app.post("/api/send-broadcast-push", async (req, res) => {
    const { title, body, category } = req.body;
    if (!title || !body) {
      return res.status(400).json({ error: "Title and body parameters are required for broadcasting alerts." });
    }

    if (!db) {
      return res.status(500).json({ error: "Backend database connection is offline. Notification bypass initiated." });
    }

    try {
      const snap = await getDocs(collection(db, "push-subscriptions"));
      if (snap.empty) {
        return res.json({ success: true, count: 0, message: "No active push notifications configured." });
      }

      const payload = JSON.stringify({ title, body, category });
      const sendPromises = snap.docs.map(async (docSnap) => {
        const data = docSnap.data();
        if (!data.subscription) return;

        try {
          await webpush.sendNotification(data.subscription, payload);
        } catch (error: any) {
          // Check for expired or inactive registrations (Status 410 or 404)
          if (error.statusCode === 410 || error.statusCode === 404) {
            console.log(`[WebPush] Pruning expired subscription for ID ${docSnap.id}`);
            try {
              await deleteDoc(doc(db, "push-subscriptions", docSnap.id));
            } catch (pruningError) {
              console.error("[WebPush] Failed to prune subscription:", pruningError);
            }
          } else {
            console.error(`[WebPush] Push execution failed for subscription ID: ${docSnap.id}`, error);
          }
        }
      });

      await Promise.all(sendPromises);
      res.json({ success: true, count: snap.size });
    } catch (err: any) {
      console.error("[Server] Broadcast WebPush system dispatch failed:", err);
      res.status(500).json({ error: err.message || "Failed to trigger PWA background alerts." });
    }
  });

  // API route to securely verify Paystack transactions
  app.post("/api/paystack-verify", async (req, res) => {
    const { reference } = req.body;
    if (!reference) {
      return res.status(400).json({ error: "Reference parameter is required." });
    }

    const paystackSecret = process.env.PAYSTACK_SECRET_KEY || "";
    if (!paystackSecret) {
      return res.status(550).json({ success: false, message: "Paystack secret key is not configured in the server environment settings." });
    }

    try {
      const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${paystackSecret}`,
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();
      
      if (data.status === true && data.data && data.data.status === "success") {
        return res.json({
          success: true,
          data: {
            amount: data.data.amount / 100, // Convert Kobo to Naira
            reference: data.data.reference,
            email: data.data.customer?.email,
            paidAt: data.data.paid_at,
          }
        });
      } else {
        return res.status(400).json({
          success: false,
          message: data.message || "Paystack transaction was unsuccessful or unverified."
        });
      }
    } catch (err: any) {
      console.error("Paystack server-side validation error: ", err);
      return res.status(500).json({
        success: false,
        error: err.message || "An error occurred during payment verification with Paystack."
      });
    }
  });

  // API route to securely initialize Paystack transactions for hosted checkout redirects
  app.post("/api/paystack-initialize", async (req, res) => {
    const { email, matricNumber, name, callbackUrl } = req.body;
    if (!email || !matricNumber) {
      return res.status(400).json({ error: "Email and Matric Number are required." });
    }

    const paystackSecret = process.env.PAYSTACK_SECRET_KEY || "";
    if (!paystackSecret) {
      return res.status(550).json({ error: "Paystack secret key is not configured in the server environment." });
    }
    const amount = 200 * 100; // ₦200 in kobo

    const reference = `sub-${matricNumber.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}`;

    try {
      const response = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${paystackSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email,
          amount: amount,
          reference: reference,
          callback_url: callbackUrl,
          metadata: {
            custom_fields: [
              {
                display_name: "Student Name",
                variable_name: "student_name",
                value: name || "Chemistry Student"
              },
              {
                display_name: "Matriculation Number",
                variable_name: "matric_number",
                value: matricNumber
              }
            ]
          }
        })
      });

      const data = await response.json();
      if (data.status === true && data.data) {
        return res.json({
          success: true,
          authorization_url: data.data.authorization_url,
          reference: data.data.reference
        });
      } else {
        return res.status(400).json({
          success: false,
          message: data.message || "Failed to initialize standard checkout."
        });
      }
    } catch (err: any) {
      console.error("Initialize Paystack error:", err);
      return res.status(500).json({
        success: false,
        error: err.message || "An error occurred during transaction initialization."
      });
    }
  });

  // Integrate Vite as a middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] ICH100L Full-stack Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
