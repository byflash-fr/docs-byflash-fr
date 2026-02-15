// Configuration
const CONFIG = {
    apiUrl: localStorage.getItem('byflash_api_url') || 'https://api.byflash.fr/index.php',
    apiKey: localStorage.getItem('byflash_api_key') || '',
    userEmail: localStorage.getItem('byflash_user_email') || '',
    userType: localStorage.getItem('byflash_user_type') || ''
};

// État de l'application
let currentDocument = null;
let documents = [];
let saveTimeout = null;
let isSaving = false;
let editorLines = [];

// Éléments DOM
const elements = {
    sidebar: document.getElementById('sidebar'),
    documentsList: document.getElementById('documentsList'),
    welcomeScreen: document.getElementById('welcomeScreen'),
    editorContent: document.getElementById('editorContent'),
    documentTitle: document.getElementById('documentTitle'),
    notionEditor: document.getElementById('notionEditor'),
    documentStatus: document.getElementById('documentStatus'),
    newDocBtn: document.getElementById('newDocBtn'),
    welcomeNewDocBtn: document.getElementById('welcomeNewDocBtn'),
    saveBtn: document.getElementById('saveBtn'),
    deleteBtn: document.getElementById('deleteBtn'),
    settingsBtn: document.getElementById('settingsBtn'),
    toggleSidebarBtn: document.getElementById('toggleSidebarBtn'),
    searchInput: document.getElementById('searchInput'),
    confirmModal: document.getElementById('confirmModal'),
    confirmTitle: document.getElementById('confirmTitle'),
    confirmMessage: document.getElementById('confirmMessage'),
    confirmOkBtn: document.getElementById('confirmOkBtn'),
    confirmCancelBtn: document.getElementById('confirmCancelBtn'),
    loginModal: document.getElementById('loginModal'),
    settingsModal: document.getElementById('settingsModal'),
    loginEmail: document.getElementById('loginEmail'),
    loginPassword: document.getElementById('loginPassword'),
    loginBtn: document.getElementById('loginBtn'),
    loginError: document.getElementById('loginError'),
    closeSettingsBtn: document.getElementById('closeSettingsBtn'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    apiUrlInput: document.getElementById('apiUrlInput'),
    userEmail: document.getElementById('userEmail'),
    userType: document.getElementById('userType')
};

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    attachEventListeners();
});

function initializeApp() {
    if (!CONFIG.apiKey || !CONFIG.userEmail) {
        showLoginModal();
        return;
    }
    
    updateUserInfo();
    loadDocuments();
    
    // Configurer marked.js
    if (typeof marked !== 'undefined') {
        marked.setOptions({
            breaks: true,
            gfm: true
        });
    }
    
    // Initialiser l'éditeur Notion-like
    initNotionEditor();
}

function attachEventListeners() {
    elements.loginBtn.addEventListener('click', handleLogin);
    elements.loginPassword.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });
    
    elements.confirmCancelBtn.addEventListener('click', hideConfirmModal);
    
    elements.newDocBtn.addEventListener('click', createNewDocument);
    elements.welcomeNewDocBtn.addEventListener('click', createNewDocument);
    
    elements.saveBtn.addEventListener('click', () => saveDocument(true));
    elements.documentTitle.addEventListener('input', () => autoSave());
    
    elements.deleteBtn.addEventListener('click', deleteCurrentDocument);
    elements.searchInput.addEventListener('input', filterDocuments);
    
    elements.settingsBtn.addEventListener('click', showSettingsModal);
    elements.closeSettingsBtn.addEventListener('click', hideSettingsModal);
    elements.saveSettingsBtn.addEventListener('click', saveSettings);
    elements.logoutBtn.addEventListener('click', handleLogout);
    
    elements.toggleSidebarBtn.addEventListener('click', toggleSidebar);
    
    document.addEventListener('keydown', handleKeyboardShortcuts);
}

// === NOTION-LIKE EDITOR ===

function initNotionEditor() {
    editorLines = [];
    const firstLine = elements.notionEditor.querySelector('.editor-line');
    if (firstLine) {
        setupEditorLine(firstLine, 0);
    }
}

function setupEditorLine(lineElement, index) {
    const input = lineElement.querySelector('.line-input');
    const preview = lineElement.querySelector('.line-preview');
    const placeholder = lineElement.querySelector('.line-placeholder');
    
    if (!input) return;
    
    // Stocker la référence
    editorLines[index] = {
        element: lineElement,
        input: input,
        preview: preview,
        placeholder: placeholder
    };

    // À ajouter dans setupEditorLine (script.js)
    preview.addEventListener('click', () => {
        preview.classList.remove('active');
        input.classList.remove('hidden');
        input.focus();
    });
    
    // Événements
    input.addEventListener('input', () => {
        handleLineInput(index);
        autoSave();
    });
    
    input.addEventListener('keydown', (e) => {
        handleLineKeydown(e, index);
    });
    
    input.addEventListener('focus', () => {
        if (placeholder) placeholder.style.display = 'none';
        input.classList.add('editing');
        input.classList.remove('hidden');
        preview.classList.remove('active');
    });
    
    input.addEventListener('blur', () => {
        const text = input.textContent.trim();
        if (text === '' && placeholder) {
            placeholder.style.display = 'block';
        }
        renderLinePreview(index);
    });
}

function handleLineInput(index) {
    const line = editorLines[index];
    if (!line) return;
    
    const text = line.input.textContent;
    
    // Masquer le placeholder si du texte est entré
    if (text && line.placeholder) {
        line.placeholder.style.display = 'none';
    } else if (!text && line.placeholder) {
        line.placeholder.style.display = 'block';
    }
}

function handleLineKeydown(e, index) {
    const line = editorLines[index];
    if (!line) return;
    
    if (e.key === 'Enter') {
        e.preventDefault();
        
        // Rendre la ligne actuelle et créer une nouvelle ligne
        renderLinePreview(index);
        createNewLine(index + 1);
    } else if (e.key === 'Backspace') {
        const text = line.input.textContent;
        
        // Si la ligne est vide et qu'on appuie sur backspace
        if (text === '' && index > 0) {
            e.preventDefault();
            deleteLine(index);
        }
    }
}

function renderLinePreview(index) {
    const line = editorLines[index];
    if (!line) return;
    
    const text = line.input.textContent.trim();
    
    if (text === '') {
        line.preview.classList.remove('active');
        line.input.classList.remove('hidden');
        return;
    }
    
    // Convertir le Markdown en HTML
    if (typeof marked !== 'undefined') {
        const html = marked.parseInline(text);
        line.preview.innerHTML = html;
        
        // Si c'est un titre, une liste, etc., utiliser marked.parse pour avoir le bon rendu
        if (text.startsWith('#') || text.startsWith('-') || text.startsWith('*') || 
            text.startsWith('>') || text.startsWith('```') || /^\d+\./.test(text)) {
            line.preview.innerHTML = marked.parse(text);
        }
        
        line.preview.classList.add('active');
        line.input.classList.add('hidden');
    }
}

function createNewLine(index) {
    const newLine = document.createElement('div');
    newLine.className = 'editor-line';
    newLine.dataset.line = index;
    newLine.innerHTML = `
        <div class="line-placeholder">Tapez '/' pour les commandes, ou commencez à écrire...</div>
        <div class="line-input" contenteditable="true"></div>
        <div class="line-preview"></div>
    `;
    
    // Insérer la nouvelle ligne
    const currentLine = editorLines[index - 1];
    if (currentLine && currentLine.element.nextSibling) {
        elements.notionEditor.insertBefore(newLine, currentLine.element.nextSibling);
    } else {
        elements.notionEditor.appendChild(newLine);
    }
    
    // Réorganiser les indices
    editorLines.splice(index, 0, null);
    setupEditorLine(newLine, index);
    
    // Focus sur la nouvelle ligne
    const input = newLine.querySelector('.line-input');
    if (input) {
        input.focus();
    }
}

function deleteLine(index) {
    if (index === 0 && editorLines.length === 1) return; // Ne pas supprimer la dernière ligne
    
    const line = editorLines[index];
    if (!line) return;
    
    // Supprimer l'élément du DOM
    line.element.remove();
    
    // Supprimer de la liste
    editorLines.splice(index, 1);
    
    // Focus sur la ligne précédente
    if (index > 0) {
        const prevLine = editorLines[index - 1];
        if (prevLine && prevLine.input) {
            prevLine.input.focus();
            
            // Placer le curseur à la fin
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(prevLine.input);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
        }
    }
}

function getEditorContent() {
    // Récupérer tout le contenu de l'éditeur en Markdown
    let content = [];
    
    editorLines.forEach(line => {
        if (line && line.input) {
            const text = line.input.textContent.trim();
            if (text) {
                content.push(text);
            }
        }
    });
    
    return content.join('\n');
}

function setEditorContent(markdown) {
    // Vider l'éditeur
    elements.notionEditor.innerHTML = '';
    editorLines = [];
    
    // Diviser le contenu en lignes
    const lines = markdown ? markdown.split('\n') : [''];
    
    lines.forEach((lineText, index) => {
        const newLine = document.createElement('div');
        newLine.className = 'editor-line';
        newLine.dataset.line = index;
        newLine.innerHTML = `
            <div class="line-placeholder" style="display: ${lineText ? 'none' : 'block'}">Tapez '/' pour les commandes, ou commencez à écrire...</div>
            <div class="line-input" contenteditable="true">${lineText}</div>
            <div class="line-preview"></div>
        `;
        
        elements.notionEditor.appendChild(newLine);
        setupEditorLine(newLine, index);
        
        // Rendre la prévisualisation si la ligne n'est pas vide
        if (lineText.trim()) {
            renderLinePreview(index);
        }
    });
    
    // Si aucune ligne n'existe, créer une ligne vide
    if (lines.length === 0) {
        createNewLine(0);
    }
}

// === CONFIRMATION MODAL ===

function showConfirm(title, message) {
    return new Promise((resolve) => {
        elements.confirmTitle.textContent = title;
        elements.confirmMessage.textContent = message;
        elements.confirmModal.classList.add('active');
        
        const newOkBtn = elements.confirmOkBtn.cloneNode(true);
        elements.confirmOkBtn.parentNode.replaceChild(newOkBtn, elements.confirmOkBtn);
        elements.confirmOkBtn = newOkBtn;
        
        elements.confirmOkBtn.addEventListener('click', () => {
            hideConfirmModal();
            resolve(true);
        });
        
        elements.confirmCancelBtn.onclick = () => {
            hideConfirmModal();
            resolve(false);
        };
    });
}

function hideConfirmModal() {
    elements.confirmModal.classList.remove('active');
}

// === AUTHENTICATION ===

async function handleLogin() {
    const email = elements.loginEmail.value.trim();
    const password = elements.loginPassword.value;
    
    if (!email || !password) {
        showLoginError('Veuillez remplir tous les champs');
        return;
    }
    
    elements.loginBtn.disabled = true;
    elements.loginBtn.textContent = 'Connexion...';
    
    try {
        const response = await fetch(`${CONFIG.apiUrl}?action=login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error || 'Identifiants incorrects');
        }
        
        CONFIG.apiKey = result.api_token;
        CONFIG.userEmail = result.email || email;
        CONFIG.userType = result.user_type || 'free';
        
        localStorage.setItem('byflash_api_key', CONFIG.apiKey);
        localStorage.setItem('byflash_user_email', CONFIG.userEmail);
        localStorage.setItem('byflash_user_type', CONFIG.userType);
        
        hideLoginModal();
        updateUserInfo();
        loadDocuments();
        
        showNotification('Connexion réussie', 'success');
        
    } catch (error) {
        showLoginError(error.message);
    } finally {
        elements.loginBtn.disabled = false;
        elements.loginBtn.textContent = 'Se connecter';
    }
}

async function handleLogout() {
    const confirmed = await showConfirm('Déconnexion', 'Êtes-vous sûr de vouloir vous déconnecter ?');
    if (!confirmed) return;
    
    localStorage.removeItem('byflash_api_key');
    localStorage.removeItem('byflash_user_email');
    localStorage.removeItem('byflash_user_type');
    
    CONFIG.apiKey = '';
    CONFIG.userEmail = '';
    CONFIG.userType = '';
    
    hideSettingsModal();
    showWelcomeScreen();
    documents = [];
    currentDocument = null;
    elements.documentsList.innerHTML = '';
    
    showLoginModal();
    showNotification('Déconnexion réussie', 'success');
}

function updateUserInfo() {
    if (elements.userEmail) {
        elements.userEmail.textContent = CONFIG.userEmail;
    }
    if (elements.userType) {
        const typeLabels = {
            'free': 'Compte Gratuit',
            'premium': 'Compte Premium',
            'enterprise': 'Compte Enterprise'
        };
        elements.userType.textContent = typeLabels[CONFIG.userType] || 'Compte Gratuit';
    }
}

function showLoginModal() {
    elements.loginModal.classList.add('active');
    elements.loginEmail.value = '';
    elements.loginPassword.value = '';
    elements.loginError.classList.remove('show');
}

function hideLoginModal() {
    elements.loginModal.classList.remove('active');
}

function showLoginError(message) {
    elements.loginError.textContent = message;
    elements.loginError.classList.add('show');
}

// === API FUNCTIONS ===

async function apiRequest(action, method = 'GET', data = null) {
    try {
        const url = `${CONFIG.apiUrl}?action=${action}`;
        const options = {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${CONFIG.apiKey}`
            }
        };
        
        if (data && method !== 'GET') {
            options.body = JSON.stringify(data);
        }
        
        const response = await fetch(url, options);
        const result = await response.json();
        
        if (!result.success) {
            if (response.status === 401) {
                showNotification('Session expirée, veuillez vous reconnecter', 'error');
                setTimeout(() => handleLogout(), 1500);
                throw new Error('Session expirée');
            }
            throw new Error(result.error || 'Erreur API');
        }
        
        return result;
    } catch (error) {
        console.error('API Error:', error);
        if (error.message !== 'Session expirée') {
            showNotification(error.message || 'Erreur de connexion à l\'API', 'error');
        }
        throw error;
    }
}

async function loadDocuments() {
    try {
        elements.documentsList.innerHTML = '<div class="loading">Chargement des documents...</div>';
        
        const result = await apiRequest('get_documents', 'GET');
        documents = result.documents || [];
        
        renderDocumentsList();
    } catch (error) {
        elements.documentsList.innerHTML = '<div class="no-documents">Erreur de chargement</div>';
    }
}

async function loadDocument(docId) {
    try {
        const result = await apiRequest(`get_documents&id=${docId}`, 'GET');
        const doc = result.document;
        
        currentDocument = doc;
        showEditor();
        
        elements.documentTitle.value = doc.title || 'Document sans titre';
        setEditorContent(doc.content || '');
        
        updateDocumentStatus('saved');
        highlightActiveDocument(docId);
    } catch (error) {
        showNotification('Impossible de charger le document', 'error');
    }
}

async function saveDocument(manual = false) {
    if (isSaving) return;
    
    const content = getEditorContent();
    
    if (!currentDocument && !elements.documentTitle.value && !content) {
        return;
    }
    
    isSaving = true;
    updateDocumentStatus('saving');
    
    try {
        const data = {
            id: currentDocument?.id || null,
            title: elements.documentTitle.value || 'Document sans titre',
            content: content
        };
        
        const result = await apiRequest('save_document', 'POST', data);
        
        if (!currentDocument) {
            currentDocument = { id: result.document_id };
        }
        
        updateDocumentStatus('saved');
        
        if (manual) {
            showNotification('Document sauvegardé', 'success');
        }
        
        await loadDocuments();
        highlightActiveDocument(currentDocument.id);
        
    } catch (error) {
        updateDocumentStatus('error');
        showNotification('Erreur lors de la sauvegarde', 'error');
    } finally {
        isSaving = false;
    }
}

async function deleteCurrentDocument() {
    if (!currentDocument) return;
    
    const confirmed = await showConfirm(
        'Supprimer le document',
        'Êtes-vous sûr de vouloir supprimer ce document ? Cette action est irréversible.'
    );
    
    if (!confirmed) return;
    
    try {
        await apiRequest('delete_document', 'POST', { id: currentDocument.id });
        showNotification('Document supprimé', 'success');
        
        currentDocument = null;
        showWelcomeScreen();
        loadDocuments();
    } catch (error) {
        showNotification('Erreur lors de la suppression', 'error');
    }
}

// === UI FUNCTIONS ===

function renderDocumentsList() {
    if (documents.length === 0) {
        elements.documentsList.innerHTML = '<div class="no-documents">Aucun document</div>';
        return;
    }
    
    elements.documentsList.innerHTML = documents
        .map(doc => `
            <div class="document-item" data-id="${doc.id}">
                <div class="document-item-title">${escapeHtml(doc.title || 'Sans titre')}</div>
                <div class="document-item-date">${formatDate(doc.updated_at || doc.created_at)}</div>
            </div>
        `)
        .join('');
    
    document.querySelectorAll('.document-item').forEach(item => {
        item.addEventListener('click', () => {
            const docId = item.getAttribute('data-id');
            loadDocument(docId);
        });
    });
}

function highlightActiveDocument(docId) {
    document.querySelectorAll('.document-item').forEach(item => {
        if (item.getAttribute('data-id') === docId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}

function createNewDocument() {
    currentDocument = null;
    showEditor();
    elements.documentTitle.value = '';
    setEditorContent('');
    elements.documentTitle.focus();
    updateDocumentStatus('saved');
    
    document.querySelectorAll('.document-item').forEach(item => {
        item.classList.remove('active');
    });
}

function showWelcomeScreen() {
    elements.welcomeScreen.style.display = 'flex';
    elements.editorContent.style.display = 'none';
}

function showEditor() {
    elements.welcomeScreen.style.display = 'none';
    elements.editorContent.style.display = 'block';
}

function updateDocumentStatus(status) {
    elements.documentStatus.className = 'document-status ' + status;
    
    const statusTexts = {
        saved: 'Sauvegardé',
        saving: 'Sauvegarde...',
        error: 'Erreur'
    };
    
    elements.documentStatus.querySelector('.status-text').textContent = statusTexts[status] || 'Sauvegardé';
}

function autoSave() {
    updateDocumentStatus('saving');
    
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        saveDocument(false);
    }, 2000);
}

function filterDocuments() {
    const searchTerm = elements.searchInput.value.toLowerCase();
    
    document.querySelectorAll('.document-item').forEach(item => {
        const title = item.querySelector('.document-item-title').textContent.toLowerCase();
        
        if (title.includes(searchTerm)) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
}

function toggleSidebar() {
    elements.sidebar.classList.toggle('collapsed');
}

// === SETTINGS ===

function showSettingsModal() {
    elements.apiUrlInput.value = CONFIG.apiUrl;
    updateUserInfo();
    elements.settingsModal.classList.add('active');
}

function hideSettingsModal() {
    elements.settingsModal.classList.remove('active');
}

function saveSettings() {
    const newApiUrl = elements.apiUrlInput.value.trim();
    
    if (!newApiUrl) {
        showNotification('Veuillez remplir l\'URL de l\'API', 'error');
        return;
    }
    
    CONFIG.apiUrl = newApiUrl;
    localStorage.setItem('byflash_api_url', CONFIG.apiUrl);
    
    hideSettingsModal();
    showNotification('Paramètres enregistrés', 'success');
}

// === KEYBOARD SHORTCUTS ===

function handleKeyboardShortcuts(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveDocument(true);
    }
}

// === UTILITY FUNCTIONS ===

function formatDate(dateString) {
    if (!dateString) return '';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
        return 'Aujourd\'hui';
    } else if (diffDays === 1) {
        return 'Hier';
    } else if (diffDays < 7) {
        return `Il y a ${diffDays} jours`;
    } else {
        return date.toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'short',
            year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        });
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 16px 24px;
        background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#495057'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 2000;
        font-size: 14px;
        font-weight: 500;
        animation: slideInRight 0.3s ease;
    `;
    notification.textContent = message;
    
    if (!document.getElementById('notification-style')) {
        const style = document.createElement('style');
        style.id = 'notification-style';
        style.textContent = `
            @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOutRight {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Fermer les modals
elements.settingsModal.addEventListener('click', (e) => {
    if (e.target === elements.settingsModal) hideSettingsModal();
});

elements.loginModal.addEventListener('click', (e) => {
    if (e.target === elements.loginModal && !CONFIG.apiKey) {
        showNotification('Veuillez vous connecter pour continuer', 'error');
    }
});

elements.confirmModal.addEventListener('click', (e) => {
    if (e.target === elements.confirmModal) hideConfirmModal();
});