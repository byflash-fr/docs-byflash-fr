const API_URL = 'https://api.byflash.fr/index.php';
let apiToken = localStorage.getItem('apiToken');
let currentDocumentId = null;
let isLoginMode = true;
let pdfElements = []; // Stocker les éléments ajoutés au PDF
let selectedElement = null;
let isDragging = false;
let isResizing = false;
let dragOffset = { x: 0, y: 0 };
let currentPDFData = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    if (!apiToken) {
        showAuthModal();
    } else {
        loadDocuments();
    }

    document.getElementById('editor').addEventListener('input', updateContent);
});

// Auth Functions
function showAuthModal() {
    document.getElementById('authModal').classList.add('active');
}

function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    document.getElementById('authSubmitBtn').textContent = isLoginMode ? 'Se connecter' : "S'inscrire";
    document.getElementById('authToggleText').textContent = isLoginMode ? 'Pas de compte ?' : 'Déjà un compte ?';
    document.querySelector('#authModal .link-btn').textContent = isLoginMode ? "S'inscrire" : 'Se connecter';
}

async function handleAuth(event) {
    event.preventDefault();
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;

    try {
        const response = await fetch(`${API_URL}?action=login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();
        
        if (data.success) {
            apiToken = data.api_token;
            localStorage.setItem('apiToken', apiToken);
            document.getElementById('authModal').classList.remove('active');
            loadDocuments();
        } else {
            alert(data.error || 'Erreur de connexion');
        }
    } catch (error) {
        alert('Erreur de connexion au serveur');
    }
}

function logout() {
    localStorage.removeItem('apiToken');
    apiToken = null;
    currentDocumentId = null;
    document.getElementById('editor').innerHTML = '';
    document.getElementById('documentTitle').value = 'Untitled Document';
    showAuthModal();
}

async function loadDocuments() {
    try {
        // Récupérer les fichiers de type document (HTML/TXT/PDF) depuis file_transfers
        const response = await fetch(`${API_URL}?action=files`, {
            headers: { 'Authorization': `Bearer ${apiToken}` }
        });

        const data = await response.json();
        
        if (data.success) {
            // Filtrer les fichiers HTML/TXT/PDF (documents éditeur)
            const documents = (data.files || []).filter(file => 
                file.name.endsWith('.html') || 
                file.name.endsWith('.txt') || 
                file.name.endsWith('.htm') ||
                file.name.endsWith('.pdf')
            );
            renderDocumentList(documents);
        }
    } catch (error) {
        console.error('Error loading documents:', error);
    }
}

function renderDocumentList(documents) {
    const listEl = document.getElementById('documentList');
    
    if (documents.length === 0) {
        listEl.innerHTML = '<div class="empty-state">Aucun document. Créez votre premier document !</div>';
        return;
    }

    listEl.innerHTML = documents.map(doc => `
        <div class="doc-item" onclick="openDocument('${doc.id}')">
            <div class="doc-info">
                <div class="doc-icon">📄</div>
                <div class="doc-details">
                    <h3>${doc.name}</h3>
                    <p>${new Date(doc.created_at).toLocaleString('fr-FR')}</p>
                </div>
            </div>
            <div class="doc-actions">
                <button class="icon-btn" onclick="deleteDocument(event, '${doc.id}')" title="Supprimer">
                    <svg class="icon" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>
        </div>
    `).join('');
}

async function openDocument(id) {
    try {
        // Récupérer les infos du fichier d'abord
        const filesResponse = await fetch(`${API_URL}?action=files`, {
            headers: { 'Authorization': `Bearer ${apiToken}` }
        });
        const filesData = await filesResponse.json();
        const fileInfo = filesData.files.find(f => f.id === id);
        
        if (!fileInfo) {
            alert('Fichier introuvable');
            return;
        }

        currentDocumentId = id;
        document.getElementById('documentTitle').value = fileInfo.name.replace(/\.(html|htm|txt|pdf)$/i, '');

        // Si c'est un PDF, afficher le lecteur PDF
        if (fileInfo.name.toLowerCase().endsWith('.pdf')) {
            await openPDFViewer(id);
            closeDocumentList();
            return;
        }

        // Sinon, télécharger le contenu HTML/TXT
        const response = await fetch(`${API_URL}?action=download&id=${id}`, {
            headers: { 'Authorization': `Bearer ${apiToken}` }
        });

        if (response.ok) {
            const htmlContent = await response.text();
            document.getElementById('editor').innerHTML = htmlContent;
            showEditor();
            closeDocumentList();
        } else {
            alert('Erreur lors du chargement du document');
        }
    } catch (error) {
        alert('Erreur lors du chargement du document');
        console.error(error);
    }
}

async function openPDFViewer(fileId) {
    try {
        // Récupérer le blob du PDF
        const response = await fetch(`${API_URL}?action=download&id=${fileId}`, {
            headers: { 'Authorization': `Bearer ${apiToken}` }
        });

        if (!response.ok) {
            throw new Error('Erreur lors du téléchargement du PDF');
        }

        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        currentPDFData = arrayBuffer;

        // Afficher le lecteur PDF
        showPDFViewer();

        // Charger le PDF avec PDF.js
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        
        // Afficher toutes les pages
        const container = document.getElementById('pdfContainer');
        container.innerHTML = '';
        pdfElements = [];
        
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            
            // Créer un canvas pour chaque page
            const canvas = document.createElement('canvas');
            canvas.className = 'pdf-page-canvas';
            const context = canvas.getContext('2d');
            
            // Calculer la taille
            const viewport = page.getViewport({ scale: 1.5 });
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            
            // Rendre la page
            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;
            
            // Ajouter le canvas au container
            const pageWrapper = document.createElement('div');
            pageWrapper.className = 'pdf-page-wrapper';
            pageWrapper.style.width = viewport.width + 'px';
            pageWrapper.style.height = viewport.height + 'px';
            pageWrapper.dataset.pageNum = pageNum;
            pageWrapper.appendChild(canvas);
            container.appendChild(pageWrapper);
        }
        
    } catch (error) {
        alert('Erreur lors de l\'ouverture du PDF : ' + error.message);
        console.error(error);
        showEditor();
    }
}

function showEditor() {
    document.querySelector('.editor-container').style.display = 'block';
    document.getElementById('pdfViewer').style.display = 'none';
    document.querySelector('.toolbar').style.display = 'flex';
}

function showPDFViewer() {
    document.querySelector('.editor-container').style.display = 'none';
    document.getElementById('pdfViewer').style.display = 'flex';
    document.querySelector('.toolbar').style.display = 'none';
}

// Fonctions d'édition PDF
function addTextToPDF() {
    const text = prompt('Entrez le texte à ajouter:');
    if (!text) return;

    const pages = document.querySelectorAll('.pdf-page-wrapper');
    if (pages.length === 0) return;

    const firstPage = pages[0];
    const fontSize = document.getElementById('pdfFontSize').value;
    const color = document.getElementById('pdfTextColor').value;

    const textElement = document.createElement('div');
    textElement.className = 'pdf-element pdf-text';
    textElement.contentEditable = true;
    textElement.textContent = text;
    textElement.style.fontSize = fontSize + 'px';
    textElement.style.color = color;
    textElement.style.left = '50px';
    textElement.style.top = '50px';

    addResizeHandles(textElement);
    makeElementDraggable(textElement);
    firstPage.appendChild(textElement);

    pdfElements.push({
        type: 'text',
        content: text,
        fontSize: fontSize,
        color: color,
        x: 50,
        y: 50,
        pageNum: 1
    });
}

function addImageToPDF() {
    document.getElementById('imageInput').click();
}

function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const pages = document.querySelectorAll('.pdf-page-wrapper');
        if (pages.length === 0) return;

        const firstPage = pages[0];
        const img = document.createElement('img');
        img.className = 'pdf-element pdf-image';
        img.src = e.target.result;
        img.style.left = '50px';
        img.style.top = '50px';

        addResizeHandles(img);
        makeElementDraggable(img);
        firstPage.appendChild(img);

        pdfElements.push({
            type: 'image',
            src: e.target.result,
            x: 50,
            y: 50,
            pageNum: 1
        });
    };
    reader.readAsDataURL(file);
    event.target.value = '';
}

function addTableToPDF() {
    const rows = prompt('Nombre de lignes:', '3');
    const cols = prompt('Nombre de colonnes:', '3');
    
    if (!rows || !cols) return;

    const pages = document.querySelectorAll('.pdf-page-wrapper');
    if (pages.length === 0) return;

    const firstPage = pages[0];
    const table = document.createElement('table');
    table.className = 'pdf-element pdf-table';
    table.style.left = '50px';
    table.style.top = '50px';

    for (let i = 0; i < parseInt(rows); i++) {
        const tr = document.createElement('tr');
        for (let j = 0; j < parseInt(cols); j++) {
            const td = document.createElement('td');
            td.contentEditable = true;
            td.textContent = '';
            tr.appendChild(td);
        }
        table.appendChild(tr);
    }

    addResizeHandles(table);
    makeElementDraggable(table);
    firstPage.appendChild(table);

    pdfElements.push({
        type: 'table',
        rows: parseInt(rows),
        cols: parseInt(cols),
        x: 50,
        y: 50,
        pageNum: 1
    });
}

function addDrawingToPDF() {
    alert('Mode dessin: Cliquez sur "Ajouter du texte" pour ajouter des annotations');
}

function addResizeHandles(element) {
    const handles = ['nw', 'ne', 'sw', 'se'];
    handles.forEach(pos => {
        const handle = document.createElement('div');
        handle.className = `resize-handle ${pos}`;
        handle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            startResize(e, element, pos);
        });
        element.appendChild(handle);
    });
}

function makeElementDraggable(element) {
    element.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('resize-handle')) return;
        
        selectElement(element);
        isDragging = true;
        const rect = element.getBoundingClientRect();
        const parentRect = element.parentElement.getBoundingClientRect();
        dragOffset.x = e.clientX - (rect.left - parentRect.left);
        dragOffset.y = e.clientY - (rect.top - parentRect.top);
        e.preventDefault();
    });
}

function selectElement(element) {
    if (selectedElement) {
        selectedElement.classList.remove('selected');
    }
    selectedElement = element;
    element.classList.add('selected');
}

function deleteSelectedElement() {
    if (selectedElement) {
        selectedElement.remove();
        selectedElement = null;
    }
}

document.addEventListener('mousemove', (e) => {
    if (isDragging && selectedElement) {
        const parentRect = selectedElement.parentElement.getBoundingClientRect();
        const newX = e.clientX - parentRect.left - dragOffset.x;
        const newY = e.clientY - parentRect.top - dragOffset.y;
        selectedElement.style.left = Math.max(0, newX) + 'px';
        selectedElement.style.top = Math.max(0, newY) + 'px';
    }
});

document.addEventListener('mouseup', () => {
    isDragging = false;
    isResizing = false;
});

function startResize(e, element, position) {
    isResizing = true;
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = element.offsetWidth;
    const startHeight = element.offsetHeight;
    const startLeft = parseInt(element.style.left || 0);
    const startTop = parseInt(element.style.top || 0);

    function resize(e) {
        if (!isResizing) return;

        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        if (position.includes('e')) {
            element.style.width = (startWidth + deltaX) + 'px';
        }
        if (position.includes('s')) {
            element.style.height = (startHeight + deltaY) + 'px';
        }
        if (position.includes('w')) {
            element.style.width = (startWidth - deltaX) + 'px';
            element.style.left = (startLeft + deltaX) + 'px';
        }
        if (position.includes('n')) {
            element.style.height = (startHeight - deltaY) + 'px';
            element.style.top = (startTop + deltaY) + 'px';
        }
    }

    document.addEventListener('mousemove', resize);
    document.addEventListener('mouseup', () => {
        isResizing = false;
        document.removeEventListener('mousemove', resize);
    }, { once: true });
}

async function savePDFChanges() {
    if (!currentPDFData) {
        alert('Aucun PDF chargé');
        return;
    }

    try {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF();
        
        // Charger le PDF original
        const loadingTask = pdfjsLib.getDocument({ data: currentPDFData });
        const pdfDoc = await loadingTask.promise;

        // Pour chaque page
        const pages = document.querySelectorAll('.pdf-page-wrapper');
        for (let i = 0; i < pages.length; i++) {
            if (i > 0) pdf.addPage();
            
            const pageWrapper = pages[i];
            const canvas = pageWrapper.querySelector('canvas');
            
            // Ajouter le contenu original
            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);

            // Ajouter les éléments ajoutés
            const elements = pageWrapper.querySelectorAll('.pdf-element');
            elements.forEach(element => {
                const x = parseInt(element.style.left) * 0.264583; // px to mm
                const y = parseInt(element.style.top) * 0.264583;

                if (element.classList.contains('pdf-text')) {
                    pdf.setFontSize(parseInt(element.style.fontSize) || 16);
                    pdf.text(element.textContent, x, y);
                } else if (element.classList.contains('pdf-image')) {
                    const imgSrc = element.src;
                    const width = element.offsetWidth * 0.264583;
                    const height = element.offsetHeight * 0.264583;
                    pdf.addImage(imgSrc, 'JPEG', x, y, width, height);
                }
            });
        }

        // Sauvegarder le PDF
        const pdfBlob = pdf.output('blob');
        const title = document.getElementById('documentTitle').value;
        const file = new File([pdfBlob], `${title}.pdf`, { type: 'application/pdf' });

        // Upload
        const formData = new FormData();
        formData.append('file', file);
        formData.append('group_id', 'editor-docs');
        formData.append('password', '');

        if (currentDocumentId) {
            await fetch(`${API_URL}?action=delete`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ id: currentDocumentId, type: 'file' })
            });
        }

        const response = await fetch(`${API_URL}?action=upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiToken}` },
            body: formData
        });

        const data = await response.json();
        if (data.success) {
            currentDocumentId = data.fileId;
            alert('PDF enregistré avec succès!');
            loadDocuments();
        } else {
            alert('Erreur lors de la sauvegarde');
        }
    } catch (error) {
        alert('Erreur lors de la sauvegarde du PDF');
        console.error(error);
    }
}

async function saveDocument() {
    if (!apiToken) {
        alert('Veuillez vous connecter pour enregistrer');
        return;
    }

    const title = document.getElementById('documentTitle').value;
    const content = document.getElementById('editor').innerHTML;

    try {
        // Créer un Blob avec le contenu HTML
        const blob = new Blob([content], { type: 'text/html' });
        const file = new File([blob], `${title}.html`, { type: 'text/html' });

        // Créer un FormData pour l'upload
        const formData = new FormData();
        formData.append('file', file);
        formData.append('group_id', 'editor-docs'); // Groupe spécial pour les documents de l'éditeur
        formData.append('password', ''); // Pas de mot de passe

        // Si c'est une mise à jour, supprimer l'ancien fichier
        if (currentDocumentId) {
            await fetch(`${API_URL}?action=delete`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ id: currentDocumentId, type: 'file' })
            });
        }

        // Upload le nouveau fichier
        const response = await fetch(`${API_URL}?action=upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiToken}`
            },
            body: formData
        });

        const data = await response.json();
        
        if (data.success) {
            currentDocumentId = data.fileId;
            alert('Document enregistré avec succès !');
            loadDocuments();
        } else {
            alert(data.error || 'Erreur lors de l\'enregistrement');
        }
    } catch (error) {
        alert('Erreur lors de l\'enregistrement du document');
        console.error(error);
    }
}

async function deleteDocument(event, id) {
    event.stopPropagation();
    
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce document ?')) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}?action=delete`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ id, type: 'file' })
        });

        const data = await response.json();
        
        if (data.success) {
            if (currentDocumentId === id) {
                newDocument();
            }
            loadDocuments();
            alert('Document supprimé avec succès');
        } else {
            alert('Erreur lors de la suppression');
        }
    } catch (error) {
        alert('Erreur lors de la suppression du document');
    }
}

function newDocument() {
    currentDocumentId = null;
    document.getElementById('documentTitle').value = 'Untitled Document';
    document.getElementById('editor').innerHTML = '';
    showEditor(); // S'assurer que l'éditeur est visible
}

function updateContent() {
    // Content is updated in real-time through contenteditable
}

// Modal Functions
function openDocumentList() {
    if (!apiToken) {
        alert('Veuillez vous connecter');
        return;
    }
    document.getElementById('documentListModal').classList.add('active');
}

function closeDocumentList() {
    document.getElementById('documentListModal').classList.remove('active');
}

function openImportDialog() {
    document.getElementById('importModal').classList.add('active');
}

function closeImportDialog() {
    document.getElementById('importModal').classList.remove('active');
}

function toggleExportMenu() {
    const menu = document.getElementById('exportMenu');
    menu.classList.toggle('active');
}

// Close export menu when clicking outside
document.addEventListener('click', (e) => {
    const exportMenu = document.querySelector('.export-menu');
    if (exportMenu && !exportMenu.contains(e.target)) {
        document.getElementById('exportMenu').classList.remove('active');
    }
});

// Export Functions
async function exportDocument(format) {
    const title = document.getElementById('documentTitle').value;
    const content = document.getElementById('editor').innerHTML;
    
    if (format === 'pdf') {
        exportToPDF(content, title);
    } else if (format === 'docx') {
        exportToDOCX(content, title);
    }
    
    document.getElementById('exportMenu').classList.remove('active');
}

function exportToPDF(content, title) {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF();
    
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;
    const text = tempDiv.textContent || tempDiv.innerText || '';
    
    const lines = pdf.splitTextToSize(text, 180);
    let y = 20;
    
    lines.forEach(line => {
        if (y > 280) {
            pdf.addPage();
            y = 20;
        }
        pdf.text(line, 15, y);
        y += 7;
    });
    
    pdf.save(`${title}.pdf`);
}

async function exportToDOCX(content, title) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;
    const text = tempDiv.textContent || tempDiv.innerText || '';
    
    const paragraphs = text.split('\n').map(line =>
        new docx.Paragraph({
            children: [new docx.TextRun(line)]
        })
    );
    
    const doc = new docx.Document({
        sections: [{
            properties: {},
            children: paragraphs
        }]
    });
    
    const blob = await docx.Packer.toBlob(doc);
    saveAs(blob, `${title}.docx`);
}

// Import Functions
async function handleFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
        let content = '';
        const fileName = file.name.toLowerCase();
        
        if (fileName.endsWith('.txt')) {
            content = await importTextFile(file);
            document.getElementById('editor').innerHTML = content;
            document.getElementById('documentTitle').value = file.name.replace(/\.[^/.]+$/, '');
            showEditor();
            closeImportDialog();
        } else if (fileName.endsWith('.docx')) {
            content = await importDocxFile(file);
            document.getElementById('editor').innerHTML = content;
            document.getElementById('documentTitle').value = file.name.replace(/\.[^/.]+$/, '');
            showEditor();
            closeImportDialog();
        } else if (fileName.endsWith('.pdf')) {
            // Pour les PDF, on les upload directement comme fichier
            await uploadPDFFile(file);
            closeImportDialog();
        } else {
            alert('Format de fichier non supporté');
            return;
        }
    } catch (error) {
        alert('Erreur lors de l\'importation du fichier');
        console.error(error);
    }
    
    // Reset input
    event.target.value = '';
}

async function uploadPDFFile(file) {
    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('group_id', 'editor-docs');
        formData.append('password', '');

        const response = await fetch(`${API_URL}?action=upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiToken}`
            },
            body: formData
        });

        const data = await response.json();
        
        if (data.success) {
            alert('PDF importé avec succès !');
            loadDocuments();
        } else {
            alert(data.error || 'Erreur lors de l\'importation');
        }
    } catch (error) {
        alert('Erreur lors de l\'importation du PDF');
        console.error(error);
    }
}

function importTextFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            resolve(text.replace(/\n/g, '<br>'));
        };
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

async function importDocxFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const arrayBuffer = e.target.result;
                const result = await mammoth.convertToHtml({ arrayBuffer });
                resolve(result.value);
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}