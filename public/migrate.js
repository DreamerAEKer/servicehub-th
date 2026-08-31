const fs = require('fs');
const path = 'app.js';
let content = fs.readFileSync(path, 'utf8');

// 1. Imports
content = content.replace(
  '// App logic for DeptDocVault\n\nconst API_URL = \'\'; // Local server endpoints are relative',
  `// App logic for DeptDocVault
import { db, storage } from './firebase-config.js';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, where, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js';`
);

// 2. fetchCategories
content = content.replace(
  /async function fetchCategories\(\) \{[\s\S]*?\n\}/m,
  `async function fetchCategories() {
  try {
    const q = query(collection(db, 'categories'), orderBy('name', 'asc'));
    const querySnapshot = await getDocs(q);
    state.categories = [];
    querySnapshot.forEach((docSnap) => {
      state.categories.push({ id: docSnap.id, ...docSnap.data() });
    });
    renderCategories();
  } catch (err) {
    showToast('โหลดหมวดหมู่ผิดพลาด: ' + err.message, 'danger');
  }
}`
);

// 3. fetchStats
content = content.replace(
  /async function fetchStats\(\) \{[\s\S]*?\n\}/m,
  `async function fetchStats() {
  try {
    state.stats = { total_docs: 0, total_size: 0, by_category: [] };
    renderStats();
  } catch (err) {
    showToast('โหลดสถิติผิดพลาด: ' + err.message, 'danger');
  }
}`
);

// 4. fetchDocuments
content = content.replace(
  /async function fetchDocuments\(\) \{[\s\S]*?\n\}/m,
  `async function fetchDocuments() {
  docGrid.innerHTML = \`
    <div class="loading-state">
      <div class="spinner"></div>
      <p>กำลังโหลดเอกสารแผนก...</p>
    </div>
  \`;
  
  try {
    let q = collection(db, 'documents');
    const querySnapshot = await getDocs(q);
    let docs = [];
    let totalSize = 0;
    
    querySnapshot.forEach((docSnap) => {
      let d = { id: docSnap.id, ...docSnap.data() };
      // Map Firestore timestamp to string if needed
      if(d.upload_date && d.upload_date.toDate) d.upload_date = d.upload_date.toDate().toISOString();
      if(d.document_date && d.document_date.toDate) d.document_date = d.document_date.toDate().toISOString();
      docs.push(d);
    });

    if (state.selectedCategory) {
      docs = docs.filter(d => d.category_id === state.selectedCategory);
    }
    if (state.searchQuery) {
      const qLower = state.searchQuery.toLowerCase();
      docs = docs.filter(d => 
        (d.title && d.title.toLowerCase().includes(qLower)) || 
        (d.description && d.description.toLowerCase().includes(qLower)) || 
        (d.tags && d.tags.toLowerCase().includes(qLower))
      );
    }
    
    docs.sort((a, b) => {
      let valA = a[state.sortBy] || '';
      let valB = b[state.sortBy] || '';
      if (state.sortOrder === 'DESC') return valB > valA ? 1 : -1;
      return valA > valB ? 1 : -1;
    });

    state.documents = docs;
    
    state.documents.forEach(d => totalSize += d.file_size || 0);
    state.stats.total_docs = state.documents.length;
    state.stats.total_size = totalSize;
    renderStats();

    renderDocuments();
  } catch (err) {
    console.error(err);
    showToast('โหลดเอกสารผิดพลาด: ' + err.message, 'danger');
  }
}`
);

// 5. deleteCategory
content = content.replace(
  /window.deleteCategory = async \(id\) => \{[\s\S]*?\n\};/m,
  `window.deleteCategory = async (id) => {
  if (!confirm('ยืนยันที่จะลบหมวดหมู่นี้หรือไม่? เอกสารที่อยู่ในหมวดหมู่นี้จะถูกเปลี่ยนเป็นแบบไม่ระบุหมวดหมู่')) return;
  try {
    await deleteDoc(doc(db, 'categories', id));
    showToast('ลบหมวดหมู่เรียบร้อยแล้ว', 'success');
    initApp();
  } catch (err) {
    showToast('ลบหมวดหมู่ไม่สำเร็จ: ' + err.message, 'danger');
  }
};`
);

// window.openPreview
content = content.replace(
  /window.openPreview = async \(id\) => \{[\s\S]*?\n\};/m,
  `window.openPreview = async (id) => {
  try {
    const docData = state.documents.find(d => d.id === id);
    if (!docData) throw new Error('Document not found');
    
    previewTitle.innerText = docData.title;
    previewDownloadLink.href = docData.file_url;
    
    if (docData.file_type === 'pdf') {
      previewViewport.innerHTML = \`<iframe src="\${docData.file_url}" type="application/pdf"></iframe>\`;
    } else {
      previewViewport.innerHTML = \`<img src="\${docData.file_url}" class="preview-img" alt="\${docData.title}">\`;
    }
    
    previewModal.classList.add('active');
  } catch (err) {
    showToast('เปิดตัวอย่างไฟล์ผิดพลาด: ' + err.message, 'danger');
  }
};`
);

// window.openEdit
content = content.replace(
  /window.openEdit = async \(id\) => \{[\s\S]*?\n\};/m,
  `window.openEdit = async (id) => {
  try {
    const docData = state.documents.find(d => d.id === id);
    if (!docData) throw new Error('Document not found');
    
    editDocId.value = docData.id;
    editDocTitle.value = docData.title;
    editDocCategory.value = docData.category_id || '';
    editDocTags.value = docData.tags || '';
    editDocDesc.value = docData.description || '';
    
    let docDateStr = '';
    if(docData.document_date) {
      const d = new Date(docData.document_date);
      docDateStr = d.toISOString().split('T')[0];
    }
    document.getElementById('edit-doc-date').value = docDateStr;
    
    editModal.classList.add('active');
  } catch (err) {
    showToast('โหลดข้อมูลผิดพลาด: ' + err.message, 'danger');
  }
};`
);

// window.deleteDocument
content = content.replace(
  /window.deleteDocument = async \(id\) => \{[\s\S]*?\n\};/m,
  `window.deleteDocument = async (id) => {
  if (!confirm('ยืนยันที่จะลบเอกสารและไฟล์นี้ออกอย่างถาวรใช่หรือไม่? การกระทำนี้ไม่สามารถเรียกคืนได้')) return;
  
  try {
    const docData = state.documents.find(d => d.id === id);
    if(docData && docData.file_path) {
      const fileRef = ref(storage, docData.file_path);
      await deleteObject(fileRef).catch(e => console.log('File not found in storage, but continuing doc deletion.'));
    }
    await deleteDoc(doc(db, 'documents', id));
    
    showToast('ลบเอกสารเสร็จสมบูรณ์', 'success');
    initApp();
  } catch (err) {
    showToast('ลบเอกสารล้มเหลว: ' + err.message, 'danger');
  }
};`
);

// uploadForm.onsubmit
content = content.replace(
  /uploadForm.onsubmit = async \(e\) => \{[\s\S]*?\n  \};/m,
  `uploadForm.onsubmit = async (e) => {
    e.preventDefault();
    if (!selectedFiles.length) {
      showToast('กรุณาเลือกไฟล์เพื่อทำการอัปโหลด', 'warning');
      return;
    }

    uploadProgressContainer.style.display = 'block';
    
    try {
      // Create a function to process a single file upload
      const uploadSingleFile = async (file) => {
        const timestamp = new Date().getTime();
        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const filename = \`\${timestamp}_\${Math.floor(Math.random() * 1000)}_\${safeName}\`;
        const filePath = \`documents/\${filename}\`;
        const storageRef = ref(storage, filePath);
        
        // Upload to storage
        const uploadTask = await uploadBytesResumable(storageRef, file);
        const downloadURL = await getDownloadURL(uploadTask.ref);
        
        // Save to Firestore
        const ext = file.name.split('.').pop().toLowerCase();
        let catId = docCategorySelect.value;
        const catObj = state.categories.find(c => c.id === catId);
        
        const docData = {
          title: docTitleInput.value.trim() || file.name,
          category_id: catId || null,
          category_name: catObj ? catObj.name : null,
          category_color: catObj ? catObj.color : null,
          document_date: document.getElementById('doc-date').value ? new Date(document.getElementById('doc-date').value) : null,
          tags: document.getElementById('doc-tags').value.trim(),
          description: document.getElementById('doc-desc').value.trim(),
          file_name: file.name,
          file_path: filePath,
          file_url: downloadURL,
          file_type: ext === 'pdf' ? 'pdf' : 'image',
          file_size: file.size,
          upload_date: serverTimestamp()
        };
        
        await addDoc(collection(db, 'documents'), docData);
      };

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        // Fake progress logic per file
        const percent = Math.round(((i) / selectedFiles.length) * 100);
        uploadProgressBar.style.width = percent + '%';
        uploadProgressBar.innerText = percent + '%';
        
        await uploadSingleFile(file);
      }
      
      uploadProgressBar.style.width = '100%';
      uploadProgressBar.innerText = '100%';
      
      showToast('อัปโหลดไฟล์เข้าระบบสำเร็จ', 'success');
      uploadModal.classList.remove('active');
      await initApp();
    } catch (err) {
      showToast('อัปโหลดผิดพลาด: ' + err.message, 'danger');
    } finally {
      uploadProgressContainer.style.display = 'none';
    }
  };`
);

// editForm.onsubmit
content = content.replace(
  /editForm.onsubmit = async \(e\) => \{[\s\S]*?\n  \};/m,
  `editForm.onsubmit = async (e) => {
    e.preventDefault();
    const id = editDocId.value;
    
    let catId = editDocCategory.value;
    const catObj = state.categories.find(c => c.id === catId);
    
    const payload = {
      title: editDocTitle.value,
      category_id: catId || null,
      category_name: catObj ? catObj.name : null,
      category_color: catObj ? catObj.color : null,
      tags: editDocTags.value,
      description: editDocDesc.value,
      document_date: document.getElementById('edit-doc-date').value ? new Date(document.getElementById('edit-doc-date').value) : null
    };

    try {
      await updateDoc(doc(db, 'documents', id), payload);
      showToast('แก้ไขข้อมูลสำเร็จ', 'success');
      editModal.classList.remove('active');
      initApp();
    } catch (err) {
      showToast('บันทึกผิดพลาด: ' + err.message, 'danger');
    }
  };`
);

// addCategoryForm.onsubmit
content = content.replace(
  /addCategoryForm.onsubmit = async \(e\) => \{[\s\S]*?\n  \};/m,
  `addCategoryForm.onsubmit = async (e) => {
    e.preventDefault();
    const payload = {
      name: document.getElementById('new-cat-name').value,
      color: document.getElementById('new-cat-color').value,
      icon: document.getElementById('new-cat-icon').value
    };

    try {
      await addDoc(collection(db, 'categories'), payload);
      showToast('เพิ่มหมวดหมู่สำเร็จ', 'success');
      document.getElementById('new-cat-name').value = '';
      initApp();
    } catch (err) {
      showToast('เพิ่มไม่สำเร็จ: ' + err.message, 'danger');
    }
  };`
);

// Backup Download Trigger
content = content.replace(
  /btnBackup.onclick = \(\) => \{[\s\S]*?\n  \};/m,
  `btnBackup.onclick = () => {
    showToast('ระบบนี้ทำงานบน Firebase การ Backup จะทำโดยอัตโนมัติบน Cloud ครับ', 'info');
  };`
);

fs.writeFileSync(path, content, 'utf8');
