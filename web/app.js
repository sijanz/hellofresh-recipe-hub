document.addEventListener('DOMContentLoaded', () => {
  // State
  let allRecipes = [];
  let selectedRecipes = new Map(); // filename -> { filename, title, servings }
  let activeFilter = 'all';
  let activeSearchQuery = '';

  // DOM Elements
  const recipeGrid = document.getElementById('recipeGrid');
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearch');
  const cuisineChips = document.getElementById('cuisineChips');
  const recipeCountBadge = document.getElementById('recipeCountBadge');

  const drawerCount = document.getElementById('drawerCount');
  const drawerList = document.getElementById('drawerList');
  const clearSelectionBtn = document.getElementById('clearSelectionBtn');
  const generateListBtn = document.getElementById('generateListBtn');

  const shoppingListModal = document.getElementById('shoppingListModal');
  const closeShoppingListModal = document.getElementById('closeShoppingListModal');
  const shoppingListContainer = document.getElementById('shoppingListContainer');
  const copyMarkdownBtn = document.getElementById('copyMarkdownBtn');
  const downloadMarkdownBtn = document.getElementById('downloadMarkdownBtn');

  const recipeModal = document.getElementById('recipeModal');
  const closeRecipeModal = document.getElementById('closeRecipeModal');
  const recipeModalContent = document.getElementById('recipeModalContent');
  const themeToggle = document.getElementById('themeToggle');

  let currentMarkdownOutput = '';

  // Theme Toggle
  themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    themeToggle.textContent = newTheme === 'dark' ? '🌙' : '☀️';
  });

  // Filter Tile Controls DOM
  const durationRangeInput = document.getElementById('durationRangeInput');
  const durationRangeVal = document.getElementById('durationRangeVal');
  const difficultyCheckGroup = document.getElementById('difficultyCheckGroup');
  const originSelect = document.getElementById('originSelect');
  const pdfOnlyCheck = document.getElementById('pdfOnlyCheck');
  const resetTileFiltersBtn = document.getElementById('resetTileFiltersBtn');

  let maxDurationFilter = 90;
  let selectedOrigins = 'all';

  // Fetch Recipes
  async function fetchRecipes() {
    try {
      const res = await fetch('/api/recipes');
      if (!res.ok) throw new Error('Fehler beim Laden der Rezepte');
      allRecipes = await res.json();
      populateOriginDropdown();
      renderCatalog();
    } catch (err) {
      recipeGrid.innerHTML = `<div class="loading-spinner"><p style="color: #ef4444;">❌ Fehler: ${err.message}</p></div>`;
    }
  }

  function populateOriginDropdown() {
    if (!originSelect) return;
    const cuisinesSet = new Set();
    allRecipes.forEach(r => {
      (r.cuisines || []).forEach(c => cuisinesSet.add(c));
    });

    const sortedCuisines = Array.from(cuisinesSet).sort();
    originSelect.innerHTML = `<option value="all">Alle Herkünfte (${allRecipes.length})</option>`;
    sortedCuisines.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      originSelect.appendChild(opt);
    });
  }

  // Duration Slider Handler
  if (durationRangeInput) {
    durationRangeInput.addEventListener('input', (e) => {
      maxDurationFilter = parseInt(e.target.value, 10);
      if (maxDurationFilter >= 90) {
        durationRangeVal.textContent = 'Alle (< 90 M)';
      } else {
        durationRangeVal.textContent = `≤ ${maxDurationFilter} Min`;
      }
      renderCatalog();
    });
  }

  // Difficulty Checkboxes Handler
  if (difficultyCheckGroup) {
    difficultyCheckGroup.querySelectorAll('input[type="checkbox"]').forEach(chk => {
      chk.addEventListener('change', renderCatalog);
    });
  }

  // Origin Dropdown Handler
  if (originSelect) {
    originSelect.addEventListener('change', (e) => {
      selectedOrigins = e.target.value;
      renderCatalog();
    });
  }

  // PDF Only Checkbox Handler
  if (pdfOnlyCheck) {
    pdfOnlyCheck.addEventListener('change', renderCatalog);
  }

  // Reset Tile Filters
  if (resetTileFiltersBtn) {
    resetTileFiltersBtn.addEventListener('click', () => {
      maxDurationFilter = 90;
      if (durationRangeInput) durationRangeInput.value = 90;
      if (durationRangeVal) durationRangeVal.textContent = 'Alle (< 90 M)';

      if (difficultyCheckGroup) {
        difficultyCheckGroup.querySelectorAll('input[type="checkbox"]').forEach(c => c.checked = true);
      }

      selectedOrigins = 'all';
      if (originSelect) originSelect.value = 'all';

      if (pdfOnlyCheck) pdfOnlyCheck.checked = false;

      renderCatalog();
    });
  }

  // Filter & Search Logic
  function getFilteredRecipes() {
    return allRecipes.filter(recipe => {
      // PDF Filter Check
      if (pdfOnlyCheck && pdfOnlyCheck.checked && !recipe.hasPdf) {
        return false;
      }

      // Duration Tile Filter
      if (maxDurationFilter < 90) {
        const prepMins = recipe.prepTimeMinutes || 30;
        if (prepMins > maxDurationFilter) return false;
      }

      // Difficulty (Stufe) Tile Filter
      if (difficultyCheckGroup) {
        const checkedDifficulties = Array.from(difficultyCheckGroup.querySelectorAll('input[type="checkbox"]:checked')).map(c => parseInt(c.value, 10));
        if (checkedDifficulties.length > 0 && !checkedDifficulties.includes(recipe.difficulty || 1)) {
          return false;
        }
      }

      // Origin / Cuisine Tile Filter
      if (selectedOrigins !== 'all') {
        if (!recipe.cuisines || !recipe.cuisines.includes(selectedOrigins)) return false;
      }

      // Search query check
      if (activeSearchQuery) {
        const q = activeSearchQuery.toLowerCase();
        const titleMatch = recipe.title && recipe.title.toLowerCase().includes(q);
        const headlineMatch = recipe.headline && recipe.headline.toLowerCase().includes(q);
        const tagMatch = (recipe.tags || []).some(t => t.toLowerCase().includes(q));
        const ingMatch = (recipe.ingredientsPreview || []).some(i => i.toLowerCase().includes(q));
        if (!titleMatch && !headlineMatch && !tagMatch && !ingMatch) return false;
      }

      return true;
    });
  }

  // Render Catalog
  function renderCatalog() {
    const recipes = getFilteredRecipes();
    recipeCountBadge.textContent = `${recipes.length} Rezepte`;

    if (recipes.length === 0) {
      recipeGrid.innerHTML = `
        <div class="loading-spinner">
          <p>🔍 Keine Rezepte gefunden matching Filter.</p>
        </div>`;
      return;
    }

    recipeGrid.innerHTML = '';
    recipes.forEach(recipe => {
      const isSelected = selectedRecipes.has(recipe.filename);
      const currentServings = isSelected ? selectedRecipes.get(recipe.filename).servings : 2;

      const card = document.createElement('div');
      card.className = `recipe-card ${isSelected ? 'selected' : ''}`;
      card.dataset.filename = recipe.filename;

      const prepTime = recipe.prepTime ? recipe.prepTime.replace('PT', '').replace('M', ' Min') : '30 Min';

      const ingredientsPreviewText = recipe.ingredientsPreview && recipe.ingredientsPreview.length > 0
        ? recipe.ingredientsPreview.join(', ') + (recipe.ingredientsCount > recipe.ingredientsPreview.length ? '...' : '')
        : 'Zutaten im Rezept';

      card.innerHTML = `
        <div class="card-image-wrap">
          <img class="card-image" src="${recipe.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80'}" alt="${escapeHtml(recipe.title)}" loading="lazy" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80';">
          ${recipe.hasPdf ? `<a class="pdf-badge" href="/api/pdf/${encodeURIComponent(recipe.pdfFilename)}" target="_blank">📄 PDF</a>` : ''}
        </div>
        <div class="card-body">
          <h3 class="card-title">${escapeHtml(recipe.title)}</h3>
          <p class="card-headline">${escapeHtml(recipe.headline || '')}</p>
          
          <div class="card-ingredients-preview" title="${escapeHtml(ingredientsPreviewText)}">
            <span class="preview-icon">🛒</span>
            <span class="preview-text">${escapeHtml(ingredientsPreviewText)}</span>
          </div>

          <div class="card-meta">
            <span class="meta-item">⏱️ ${prepTime}</span>
            <span class="meta-item">⭐ Stufe ${recipe.difficulty || 1}</span>
            ${recipe.cuisines && recipe.cuisines.length > 0 ? `<span class="meta-item">🌐 ${recipe.cuisines[0]}</span>` : ''}
          </div>

          <div class="card-footer">
            <div class="portion-selector">
              <label>Portionen:</label>
              <select class="portion-select" data-filename="${recipe.filename}">
                <option value="2" ${currentServings == 2 ? 'selected' : ''}>2</option>
                <option value="3" ${currentServings == 3 ? 'selected' : ''}>3</option>
                <option value="4" ${currentServings == 4 ? 'selected' : ''}>4</option>
                <option value="6" ${currentServings == 6 ? 'selected' : ''}>6</option>
              </select>
            </div>

            <button class="btn-select">
              ${isSelected ? '✓ Ausgewählt' : '+ Wählen'}
            </button>
          </div>
          <div style="margin-top: 0.5rem; text-align: right;">
            <button class="btn-details" data-filename="${recipe.filename}">Rezept ansehen →</button>
          </div>
        </div>
      `;

      // Select / Deselect Button Click
      const selectBtn = card.querySelector('.btn-select');
      selectBtn.addEventListener('click', () => {
        const portionSelect = card.querySelector('.portion-select');
        const servings = parseInt(portionSelect.value, 10);
        toggleRecipeSelection(recipe.filename, recipe.title, servings);
      });

      // Portion Change Listener
      const portionSelect = card.querySelector('.portion-select');
      portionSelect.addEventListener('change', (e) => {
        const newServings = parseInt(e.target.value, 10);
        if (selectedRecipes.has(recipe.filename)) {
          selectedRecipes.get(recipe.filename).servings = newServings;
          updateDrawerUI();
        }
      });

      // Detail Modal Click
      const detailsBtn = card.querySelector('.btn-details');
      detailsBtn.addEventListener('click', () => {
        openRecipeDetailModal(recipe.filename);
      });

      recipeGrid.appendChild(card);
    });
  }

  // Toggle Selection State
  function toggleRecipeSelection(filename, title, servings = 2) {
    if (selectedRecipes.has(filename)) {
      selectedRecipes.delete(filename);
    } else {
      selectedRecipes.set(filename, { filename, title, servings });
    }
    renderCatalog();
    updateDrawerUI();
  }

  // Update Drawer UI
  function updateDrawerUI() {
    const count = selectedRecipes.size;
    drawerCount.textContent = count;
    generateListBtn.disabled = count === 0;

    if (count === 0) {
      drawerList.innerHTML = `<div class="empty-drawer"><p>Wähle Rezepte aus dem Katalog aus, um eine Einkaufsliste zu generieren.</p></div>`;
      return;
    }

    drawerList.innerHTML = '';
    selectedRecipes.forEach((item, filename) => {
      const row = document.createElement('div');
      row.className = 'selected-item-row';
      row.innerHTML = `
        <div class="selected-item-info">
          <div class="selected-item-title">${escapeHtml(item.title)}</div>
          <span style="font-size: 0.75rem; color: var(--text-muted);">${item.servings} Portionen</span>
        </div>
        <button class="btn-remove-item" data-filename="${filename}">✕</button>
      `;

      row.querySelector('.btn-remove-item').addEventListener('click', () => {
        selectedRecipes.delete(filename);
        renderCatalog();
        updateDrawerUI();
      });

      drawerList.appendChild(row);
    });
  }

  // Clear Selection
  clearSelectionBtn.addEventListener('click', () => {
    selectedRecipes.clear();
    renderCatalog();
    updateDrawerUI();
  });

  // Search Input Events
  searchInput.addEventListener('input', (e) => {
    activeSearchQuery = e.target.value.trim();
    clearSearchBtn.classList.toggle('hidden', activeSearchQuery === '');
    renderCatalog();
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    activeSearchQuery = '';
    clearSearchBtn.classList.add('hidden');
    renderCatalog();
  });

  // Generate Shopping List
  generateListBtn.addEventListener('click', async () => {
    if (selectedRecipes.size === 0) return;

    const items = Array.from(selectedRecipes.values());
    try {
      generateListBtn.textContent = '⏳ Generiere...';
      generateListBtn.disabled = true;

      const res = await fetch('/api/shopping-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
      });

      if (!res.ok) throw new Error('Fehler beim Erstellen der Einkaufsliste');

      const data = await res.json();
      currentMarkdownOutput = data.markdown;
      renderShoppingListModal(data);
    } catch (err) {
      alert(`Fehler: ${err.message}`);
    } finally {
      generateListBtn.textContent = '✨ Einkaufsliste generieren';
      generateListBtn.disabled = false;
    }
  });

  // Render Shopping List Modal Content
  function renderShoppingListModal(data) {
    let html = '';

    // Selected recipes recap
    html += `<div style="margin-bottom: 1rem; padding: 0.75rem; background: var(--bg-base); border-radius: var(--radius-sm); border: 1px solid var(--border-color);">`;
    html += `<strong style="font-size: 0.9rem;">Rezepte:</strong> `;
    html += data.recipes.map(r => `<span class="meta-item">${escapeHtml(r.title)} (${r.servings}P)</span>`).join(' • ');
    html += `</div>`;

    // Render Supermarket Categories
    if (data.categories && data.categories.length > 0) {
      data.categories.forEach((cat, catIdx) => {
        html += `<div class="shopping-section">`;
        html += `<h3>${escapeHtml(cat.name)} (${cat.items.length})</h3>`;
        html += `<div class="ingredient-checkbox-list">`;
        cat.items.forEach((item, i) => {
          const pantryBadge = item.shipped ? '' : ' <span style="font-size: 0.72rem; color: var(--text-muted); opacity: 0.8;">(Vorrat)</span>';
          html += `
            <label class="ingredient-item-row" id="ing_row_${catIdx}_${i}">
              <input type="checkbox" onchange="this.parentElement.classList.toggle('checked', this.checked)">
              <span class="ing-amount">${escapeHtml(item.amount)}</span>
              <span class="ing-name">${escapeHtml(item.name)}${pantryBadge}</span>
              <span class="ing-recipes">${escapeHtml(item.recipes)}</span>
            </label>
          `;
        });
        html += `</div></div>`;
      });
    }

    shoppingListContainer.innerHTML = html;
    shoppingListModal.classList.remove('hidden');
  }

  // Copy Markdown
  copyMarkdownBtn.addEventListener('click', () => {
    if (!currentMarkdownOutput) return;
    navigator.clipboard.writeText(currentMarkdownOutput).then(() => {
      copyMarkdownBtn.textContent = '✓ Kopiert!';
      setTimeout(() => {
        copyMarkdownBtn.textContent = '📋 In Zwischenablage kopieren';
      }, 2000);
    });
  });

  // Download Markdown
  downloadMarkdownBtn.addEventListener('click', () => {
    if (!currentMarkdownOutput) return;
    const blob = new Blob([currentMarkdownOutput], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'shopping_list.md';
    a.click();
    URL.revokeObjectURL(url);
  });

  closeShoppingListModal.addEventListener('click', () => {
    shoppingListModal.classList.add('hidden');
  });

  // Open Recipe Detail Modal
  async function openRecipeDetailModal(filename) {
    try {
      recipeModalContent.innerHTML = `<div class="loading-spinner"><div class="spinner"></div><p>Lade Rezept-Details...</p></div>`;
      recipeModal.classList.remove('hidden');

      const res = await fetch(`/api/recipes/${encodeURIComponent(filename)}`);
      if (!res.ok) throw new Error('Rezept konnte nicht geladen werden');

      const r = await res.json();

      let stepsHtml = '';
      if (r.steps && r.steps.length > 0) {
        stepsHtml = '<h3>Anleitung:</h3><ol style="margin-left: 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; margin-top: 0.5rem;">';
        r.steps.forEach(step => {
          stepsHtml += `<li><strong>Step ${step.index || ''}:</strong> ${escapeHtml(step.instructions || step.text || '')}</li>`;
        });
        stepsHtml += '</ol>';
      }

      let ingredientsHtml = '<h3>Zutaten:</h3><ul style="margin-left: 1.25rem; margin-top: 0.5rem; margin-bottom: 1.5rem;">';
      (r.ingredients || []).forEach(ing => {
        ingredientsHtml += `<li>${escapeHtml(ing.name || '')} ${ing.shipped ? '' : '<em>(Pantry)</em>'}</li>`;
      });
      ingredientsHtml += '</ul>';

      const pdfFilename = filename.rsplit ? filename.rsplit('.', 1)[0] + '.pdf' : filename.replace('.json', '.pdf');

      recipeModalContent.innerHTML = `
        <div style="display: flex; gap: 1rem; align-items: flex-start; margin-bottom: 1rem;">
          <img src="${r.imageLink || 'https://via.placeholder.com/400x300'}" style="width: 140px; height: 100px; object-fit: cover; border-radius: var(--radius-sm);" alt="Thumbnail">
          <div>
            <h2 style="font-family: var(--font-heading);">${escapeHtml(r.name)}</h2>
            <p style="color: var(--text-muted); font-size: 0.9rem;">${escapeHtml(r.headline || '')}</p>
            <p style="margin-top: 0.4rem; font-size: 0.85rem;">${escapeHtml(r.description || '')}</p>
          </div>
        </div>
        <hr style="border-color: var(--border-color); margin-bottom: 1rem;">
        ${ingredientsHtml}
        ${stepsHtml}
      `;
    } catch (err) {
      recipeModalContent.innerHTML = `<p style="color: #ef4444;">Fehler: ${err.message}</p>`;
    }
  }

  closeRecipeModal.addEventListener('click', () => {
    recipeModal.classList.add('hidden');
  });

  // Email Modal & Sending Logic
  const openEmailModalBtn = document.getElementById('openEmailModalBtn');
  const emailModal = document.getElementById('emailModal');
  const closeEmailModal = document.getElementById('closeEmailModal');
  const cancelEmailBtn = document.getElementById('cancelEmailBtn');
  const emailForm = document.getElementById('emailForm');
  const emailRecipient = document.getElementById('emailRecipient');
  const emailPassword = document.getElementById('emailPassword');
  const emailStatusMessage = document.getElementById('emailStatusMessage');
  const sendEmailSubmitBtn = document.getElementById('sendEmailSubmitBtn');

  // Load Saved Config / Default Recipient
  async function loadConfig() {
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const config = await res.json();
        const savedEmail = localStorage.getItem('recipient_email') || config.defaultRecipient;
        if (emailRecipient) emailRecipient.value = savedEmail;
      }
    } catch (e) {
      console.log('Config load error', e);
    }
  }

  if (openEmailModalBtn) {
    openEmailModalBtn.addEventListener('click', () => {
      emailStatusMessage.style.display = 'none';
      emailModal.classList.remove('hidden');
    });
  }

  const closeEmail = () => emailModal.classList.add('hidden');
  if (closeEmailModal) closeEmailModal.addEventListener('click', closeEmail);
  if (cancelEmailBtn) cancelEmailBtn.addEventListener('click', closeEmail);

  if (emailForm) {
    emailForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const recipientEmail = emailRecipient.value.trim();
      const smtpPassword = emailPassword.value;

      if (!recipientEmail || !smtpPassword) {
        showEmailStatus('Bitte alle Felder ausfüllen.', true);
        return;
      }

      // Save email for convenience
      localStorage.setItem('recipient_email', recipientEmail);

      try {
        sendEmailSubmitBtn.textContent = '⏳ Sende E-Mail...';
        sendEmailSubmitBtn.disabled = true;
        showEmailStatus('Sende E-Mail an ' + recipientEmail + '...', false);

        const res = await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipientEmail,
            smtpPassword,
            markdown: currentMarkdownOutput
          })
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Fehler beim E-Mail-Versand');
        }

        showEmailStatus('✓ ' + data.message, false);
        setTimeout(() => {
          emailModal.classList.add('hidden');
          emailPassword.value = '';
        }, 2000);

      } catch (err) {
        showEmailStatus('❌ ' + err.message, true);
      } finally {
        sendEmailSubmitBtn.textContent = '📤 Einkaufsliste Senden';
        sendEmailSubmitBtn.disabled = false;
      }
    });
  }

  function showEmailStatus(msg, isError) {
    emailStatusMessage.style.display = 'block';
    emailStatusMessage.style.color = isError ? '#ef4444' : 'var(--accent)';
    emailStatusMessage.textContent = msg;
  }

  // Helper
  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, match => {
      const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
      return map[match];
    });
  }

  // Initial load
  loadConfig();
  fetchRecipes();
});
