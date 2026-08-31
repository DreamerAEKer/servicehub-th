const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const pdfParse = require('pdf-parse');
const { PDFDocument } = require('pdf-lib');
const dbHelper = require('./database');

function parseDateFromText(text) {
  if (!text) return null;
  const cleanText = text.replace(/\s+/g, ' ');
  
  const thMonths = {
    'มกราคม': '01', 'ม.ค.': '01', 'ม.ค': '01',
    'กุมภาพันธ์': '02', 'ก.พ.': '02', 'ก.พ': '02',
    'มีนาคม': '03', 'มี.ค.': '03', 'มี.ค': '03',
    'เมษายน': '04', 'เม.ย.': '04', 'เม.ย': '04',
    'พฤษภาคม': '05', 'พ.ค.': '05', 'พ.ค': '05',
    'มิถุนายน': '06', 'มิ.ย.': '06', 'มิ.ย': '06',
    'กรกฎาคม': '07', 'ก.ค.': '07', 'ก.ค': '07',
    'สิงหาคม': '08', 'ส.ค.': '08', 'ส.ค': '08',
    'กันยายน': '09', 'ก.ย.': '09', 'ก.ย': '09',
    'ตุลาคม': '10', 'ต.ค.': '10', 'ต.ค': '10',
    'พฤศจิกายน': '11', 'พ.ย.': '11', 'พ.ย': '11',
    'ธันวาคม': '12', 'ธ.ค.': '12', 'ธ.ค': '12'
  };

  // 1. Thai date names
  for (const [mName, mVal] of Object.entries(thMonths)) {
    const escapedMonth = mName.replace('.', '\\.');
    const regexStr = `(?:ณ\\s*วันที่|วันที่|วันที่\\s*|วัน\\s*ที่)?\\s*(\\d{1,2})\\s*(?:${escapedMonth})\\s*(?:พ\\.?ศ\\.?\\s*)?(\\d{2,4})`;
    const match = cleanText.match(new RegExp(regexStr, 'i'));
    
    if (match) {
      let day = parseInt(match[1]);
      let year = parseInt(match[2]);
      if (day >= 1 && day <= 31) {
        if (year < 100) {
          year = year + 2500 - 543;
        } else if (year > 2400) {
          year = year - 543;
        }
        return `${year}-${mVal}-${String(day).padStart(2, '0')}`;
      }
    }
  }

  // 2. Generic numbers formats (DD/MM/YYYY)
  const dmyMatch = cleanText.match(/(\d{1,2})[-/.](\d{1,2})[-/.](25\d{2}|20\d{2})/);
  if (dmyMatch) {
    let day = parseInt(dmyMatch[1]);
    let month = parseInt(dmyMatch[2]);
    let year = parseInt(dmyMatch[3]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      if (year > 2400) year = year - 543;
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  return null;
}

async function mergeFilesToPdf(files, outputFilePath) {
  const mergedPdf = await PDFDocument.create();
  
  for (const file of files) {
    const fileFullPath = file.path;
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (ext === '.pdf') {
      const pdfBytes = fs.readFileSync(fileFullPath);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    } else if (ext === '.jpg' || ext === '.jpeg') {
      const imgBytes = fs.readFileSync(fileFullPath);
      const img = await mergedPdf.embedJpg(imgBytes);
      
      // Calculate scaled size or fit to page if very large
      const page = mergedPdf.addPage([img.width, img.height]);
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    } else if (ext === '.png') {
      const imgBytes = fs.readFileSync(fileFullPath);
      const img = await mergedPdf.embedPng(imgBytes);
      
      const page = mergedPdf.addPage([img.width, img.height]);
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    } else {
      throw new Error(`ไม่รองรับประเภทไฟล์: ${ext}`);
    }
  }
  
  const mergedPdfBytes = await mergedPdf.save();
  fs.writeFileSync(outputFilePath, mergedPdfBytes);
}

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'public')));

// Serve uploaded files
app.use('/uploads', express.static(dbHelper.UPLOADS_DIR));

// Setup Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, dbHelper.UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    // Generate safe and unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB Limit
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif|pdf/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('รองรับเฉพาะไฟล์รูปภาพ (JPG, PNG, GIF) และไฟล์ PDF เท่านั้น'));
    }
  }
});

// --- API ROUTES ---

// 1. Get stats
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await dbHelper.getStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Get categories
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await dbHelper.getCategories();
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Create category
app.post('/api/categories', async (req, res) => {
  try {
    const { name, color, icon } = req.body;
    if (!name) return res.status(400).json({ error: 'กรุณากรอกชื่อหมวดหมู่' });
    const cat = await dbHelper.addCategory(name, color, icon);
    res.status(201).json(cat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Delete category
app.delete('/api/categories/:id', async (req, res) => {
  try {
    await dbHelper.deleteCategory(req.params.id);
    res.json({ message: 'ลบหมวดหมู่เรียบร้อยแล้ว' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. List and search documents
app.get('/api/documents', async (req, res) => {
  try {
    const { search, categoryId, sortBy, sortOrder } = req.query;
    const documents = await dbHelper.getDocuments(search, categoryId, sortBy, sortOrder);
    res.json(documents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Get single document details
app.get('/api/documents/:id', async (req, res) => {
  try {
    const doc = await dbHelper.getDocumentById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'ไม่พบเอกสารนี้' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Upload document (supports multiple file merging)
app.post('/api/documents', upload.array('files', 50), async (req, res) => {
  try {
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'กรุณาเลือกไฟล์ที่ต้องการอัปโหลด' });
    }

    const { title, categoryId, description, tags, documentDate } = req.body;
    
    let fileName = '';
    let filePath = '';
    let fileSize = 0;
    let fileType = 'pdf'; // Default to pdf for merged files
    
    if (files.length === 1) {
      const file = files[0];
      fileName = file.originalname;
      filePath = file.filename;
      fileSize = file.size;
      fileType = file.mimetype.includes('pdf') ? 'pdf' : 'image';
    } else {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      filePath = 'merged-' + uniqueSuffix + '.pdf';
      const outputFullPath = path.join(dbHelper.UPLOADS_DIR, filePath);
      
      try {
        await mergeFilesToPdf(files, outputFullPath);
      } catch (mergeErr) {
        // Cleanup temp files
        files.forEach(f => {
          if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
        });
        return res.status(500).json({ error: 'ไม่สามารถรวมไฟล์ได้: ' + mergeErr.message });
      }

      // Cleanup original temporary files from disk as they are now merged
      files.forEach(f => {
        if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
      });

      // Update metadata for DB
      fileName = title ? (title.endsWith('.pdf') ? title : title + '.pdf') : 'เอกสารรวม-' + uniqueSuffix + '.pdf';
      fileSize = fs.statSync(outputFullPath).size;
      fileType = 'pdf';
    }

    const docTitle = title || path.parse(fileName).name;
    let finalDocDate = documentDate || null;
    
    // Auto-parse date from PDF content if user didn't specify a date
    if (!finalDocDate && fileType === 'pdf') {
      try {
        const fileFullPath = path.join(dbHelper.UPLOADS_DIR, filePath);
        const dataBuffer = fs.readFileSync(fileFullPath);
        const pdfData = await pdfParse(dataBuffer);
        finalDocDate = parseDateFromText(pdfData.text);
      } catch (err) {
        console.error('Error extracting date from PDF content:', err);
      }
    }

    const docId = await dbHelper.addDocument(
      docTitle,
      categoryId ? parseInt(categoryId) : null,
      fileName,
      filePath,
      fileSize,
      fileType,
      description || '',
      tags || '',
      finalDocDate
    );

    const doc = await dbHelper.getDocumentById(docId);
    res.status(201).json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Edit document metadata (and optionally append files)
app.put('/api/documents/:id', upload.array('files', 50), async (req, res) => {
  try {
    const { title, categoryId, description, tags, documentDate } = req.body;
    if (!title) {
      if (req.files && req.files.length > 0) {
        req.files.forEach(f => { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); });
      }
      return res.status(400).json({ error: 'กรุณากรอกชื่อเอกสาร' });
    }

    const docId = req.params.id;
    const existingDoc = await dbHelper.getDocumentById(docId);
    if (!existingDoc) {
      if (req.files && req.files.length > 0) {
        req.files.forEach(f => { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); });
      }
      return res.status(404).json({ error: 'ไม่พบเอกสารนี้' });
    }

    let fileName = null;
    let filePath = null;
    let fileSize = null;
    let fileType = null;

    if (req.files && req.files.length > 0) {
      const existingFileObj = {
        path: path.join(dbHelper.UPLOADS_DIR, existingDoc.file_path),
        originalname: existingDoc.file_name
      };

      const filesToMerge = [existingFileObj, ...req.files];
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      filePath = 'merged-' + uniqueSuffix + '.pdf';
      const outputFullPath = path.join(dbHelper.UPLOADS_DIR, filePath);

      try {
        await mergeFilesToPdf(filesToMerge, outputFullPath);
      } catch (mergeErr) {
        req.files.forEach(f => {
          if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
        });
        return res.status(500).json({ error: 'ไม่สามารถรวมไฟล์ได้: ' + mergeErr.message });
      }

      req.files.forEach(f => {
        if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
      });

      const oldDiskPath = path.join(dbHelper.UPLOADS_DIR, existingDoc.file_path);
      if (fs.existsSync(oldDiskPath)) {
        fs.unlinkSync(oldDiskPath);
      }

      fileName = existingDoc.file_name.endsWith('.pdf') ? existingDoc.file_name : existingDoc.file_name + '.pdf';
      fileSize = fs.statSync(outputFullPath).size;
      fileType = 'pdf';
    }

    await dbHelper.updateDocument(
      docId,
      title,
      categoryId ? parseInt(categoryId) : null,
      description || '',
      tags || '',
      documentDate || null,
      fileName,
      filePath,
      fileSize,
      fileType
    );

    const doc = await dbHelper.getDocumentById(docId);
    res.json(doc);
  } catch (err) {
    if (req.files && req.files.length > 0) {
      req.files.forEach(f => { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); });
    }
    res.status(500).json({ error: err.message });
  }
});

// 9. Delete document (and file from disk)
app.delete('/api/documents/:id', async (req, res) => {
  try {
    const doc = await dbHelper.getDocumentById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'ไม่พบเอกสารนี้' });

    // Delete file from disk
    const diskPath = path.join(dbHelper.UPLOADS_DIR, doc.file_path);
    if (fs.existsSync(diskPath)) {
      fs.unlinkSync(diskPath);
    }

    // Delete record from Database
    await dbHelper.deleteDocument(req.params.id);
    res.json({ message: 'ลบเอกสารและไฟล์ออกจากระบบสำเร็จ' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 10. Backup Endpoint (Backup entire application data - SQLite database + Uploaded files)
app.get('/api/backup', async (req, res) => {
  try {
    const zip = new AdmZip();
    
    // Add database to zip
    if (fs.existsSync(dbHelper.DB_PATH)) {
      zip.addLocalFile(dbHelper.DB_PATH);
    }

    // Add upload files folder to zip under 'uploads/' directory
    if (fs.existsSync(dbHelper.UPLOADS_DIR)) {
      zip.addLocalFolder(dbHelper.UPLOADS_DIR, 'uploads');
    }

    const zipFilename = `backup-deptdocvault-${Date.now()}.zip`;
    const zipBuffer = zip.toBuffer();

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${zipFilename}"`,
      'Content-Length': zipBuffer.length
    });

    res.send(zipBuffer);
  } catch (err) {
    console.error('Backup error:', err);
    res.status(500).json({ error: 'ไม่สามารถสำรองข้อมูลได้: ' + err.message });
  }
});

// Error Handler middleware
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `เกิดข้อผิดพลาดในการอัปโหลด: ${err.message}` });
  }
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
