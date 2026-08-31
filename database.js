const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'db.sqlite');
const UPLOADS_DIR = path.join(__dirname, 'storage', 'uploads');

// Ensure upload directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error opening database', err);
  } else {
    console.log('Connected to SQLite database at', DB_PATH);
    initializeDatabase();
  }
});

function initializeDatabase() {
  db.serialize(() => {
    // Create categories table
    db.run(`
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        color TEXT DEFAULT '#6366f1',
        icon TEXT DEFAULT 'folder'
      )
    `, (err) => {
      if (err) console.error('Error creating categories table', err);
      else insertDefaultCategories();
    });

    // Create documents table
    db.run(`
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        category_id INTEGER,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        file_type TEXT NOT NULL,
        upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        description TEXT,
        tags TEXT,
        document_date TEXT,
        FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE SET NULL
      )
    `, (err) => {
      if (err) console.error('Error creating documents table', err);
      // Migration: Add document_date column if existing db doesn't have it
      db.run("ALTER TABLE documents ADD COLUMN document_date TEXT", (alterErr) => {
        // Ignore duplicate column errors
      });
    });
  });
}

function insertDefaultCategories() {
  const defaults = [
    { name: 'คู่มือ / Manuals', color: '#6366f1', icon: 'book-open' },
    { name: 'รายงาน / Reports', color: '#3b82f6', icon: 'file-text' },
    { name: 'ประกาศ / Announcements', color: '#10b981', icon: 'megaphone' },
    { name: 'รูปภาพกิจกรรม / Event Photos', color: '#ec4899', icon: 'image' },
    { name: 'เอกสารฝึกอบรม / Training Docs', color: '#f59e0b', icon: 'graduation-cap' },
    { name: 'อื่นๆ / Others', color: '#6b7280', icon: 'folder' }
  ];

  const stmt = db.prepare('INSERT OR IGNORE INTO categories (name, color, icon) VALUES (?, ?, ?)');
  defaults.forEach(cat => {
    stmt.run(cat.name, cat.color, cat.icon);
  });
  stmt.finalize();
}

// Database Helpers
module.exports = {
  db,
  DB_PATH,
  UPLOADS_DIR,
  
  // Categories API
  getCategories: () => {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM categories ORDER BY id ASC', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },

  addCategory: (name, color, icon) => {
    return new Promise((resolve, reject) => {
      db.run('INSERT INTO categories (name, color, icon) VALUES (?, ?, ?)', [name, color, icon], function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, name, color, icon });
      });
    });
  },

  deleteCategory: (id) => {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM categories WHERE id = ?', [id], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  },

  // Documents API
  getDocuments: (searchQuery = '', categoryId = null, sortBy = 'upload_date', sortOrder = 'DESC') => {
    return new Promise((resolve, reject) => {
      let sql = `
        SELECT d.*, c.name as category_name, c.color as category_color, c.icon as category_icon 
        FROM documents d 
        LEFT JOIN categories c ON d.category_id = c.id
        WHERE 1=1
      `;
      const params = [];

      if (categoryId) {
        sql += ' AND d.category_id = ?';
        params.push(categoryId);
      }

      if (searchQuery) {
        sql += ' AND (d.title LIKE ? OR d.description LIKE ? OR d.tags LIKE ? OR d.file_name LIKE ?)';
        const searchPattern = `%${searchQuery}%`;
        params.push(searchPattern, searchPattern, searchPattern, searchPattern);
      }

      // Safe sorting validation
      const allowedSortFields = ['upload_date', 'document_date', 'title', 'file_size'];
      const allowedSortOrders = ['ASC', 'DESC'];
      const field = allowedSortFields.includes(sortBy) ? sortBy : 'upload_date';
      const order = allowedSortOrders.includes(sortOrder) ? sortOrder : 'DESC';

      sql += ` ORDER BY d.${field} ${order}`;

      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },

  getDocumentById: (id) => {
    return new Promise((resolve, reject) => {
      db.get(`
        SELECT d.*, c.name as category_name, c.color as category_color, c.icon as category_icon 
        FROM documents d 
        LEFT JOIN categories c ON d.category_id = c.id
        WHERE d.id = ?
      `, [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },

  addDocument: (title, categoryId, fileName, filePath, fileSize, fileType, description, tags, documentDate) => {
    return new Promise((resolve, reject) => {
      db.run(`
        INSERT INTO documents (title, category_id, file_name, file_path, file_size, file_type, description, tags, document_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [title, categoryId, fileName, filePath, fileSize, fileType, description, tags, documentDate], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  },

  updateDocument: (id, title, categoryId, description, tags, documentDate, fileName = null, filePath = null, fileSize = null, fileType = null) => {
    return new Promise((resolve, reject) => {
      let sql = `
        UPDATE documents 
        SET title = ?, category_id = ?, description = ?, tags = ?, document_date = ?
      `;
      const params = [title, categoryId, description, tags, documentDate];
      
      if (fileName && filePath && fileSize !== null && fileType) {
        sql += `, file_name = ?, file_path = ?, file_size = ?, file_type = ?`;
        params.push(fileName, filePath, fileSize, fileType);
      }
      
      sql += ` WHERE id = ?`;
      params.push(id);

      db.run(sql, params, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  },

  deleteDocument: (id) => {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM documents WHERE id = ?', [id], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  },

  getStats: () => {
    return new Promise((resolve, reject) => {
      db.all(`
        SELECT 
          COUNT(d.id) as total_docs,
          SUM(d.file_size) as total_size,
          (SELECT COUNT(*) FROM categories) as total_categories
        FROM documents d
      `, [], (err, rows) => {
        if (err) return reject(err);
        const mainStats = rows[0] || { total_docs: 0, total_size: 0, total_categories: 0 };
        
        db.all(`
          SELECT c.name as category, COUNT(d.id) as count, SUM(d.file_size) as size
          FROM categories c
          LEFT JOIN documents d ON c.id = d.category_id
          GROUP BY c.id
        `, [], (err, catRows) => {
          if (err) return reject(err);
          resolve({
            ...mainStats,
            by_category: catRows
          });
        });
      });
    });
  }
};
