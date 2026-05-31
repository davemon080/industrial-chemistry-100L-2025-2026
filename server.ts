import express from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { createServer as createViteServer } from "vite";

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
