(() => {
  'use strict';
  const products = [
    { name: 'Escritorio ejecutivo', sku: 'MOB-001', category: 'Mobiliario', units: 12, cost: 3250, icon: 'grid', description: 'Escritorio de oficina con superficie de madera y estructura metálica.' },
    { name: 'Silla ergonómica', sku: 'MOB-002', category: 'Mobiliario', units: 8, cost: 1850, icon: 'user', description: 'Silla de oficina con respaldo ajustable y base giratoria.' },
    { name: 'Lámpara de escritorio', sku: 'ACC-003', category: 'Accesorios', units: 0, cost: 650, icon: 'layers', description: 'Lámpara de iluminación LED para estaciones de trabajo.' },
    { name: 'Archivador metálico', sku: 'MOB-004', category: 'Mobiliario', units: 4, cost: 2400, icon: 'file', description: 'Archivador de tres gavetas para organización de documentos.' },
    { name: 'Monitor de 24 pulgadas', sku: 'TEC-005', category: 'Tecnología', units: 7, cost: 5100, icon: 'grid', description: 'Monitor para equipos de oficina con pantalla de 24 pulgadas.' },
    { name: 'Teclado inalámbrico', sku: 'TEC-006', category: 'Tecnología', units: 18, cost: 480, icon: 'layers', description: 'Teclado compacto con conexión inalámbrica para escritorio.' },
    { name: 'Estante de oficina', sku: 'MOB-007', category: 'Mobiliario', units: 3, cost: 2850, icon: 'box', description: 'Estante de cuatro niveles para material de oficina.' },
    { name: 'Mouse inalámbrico', sku: 'TEC-008', category: 'Tecnología', units: 24, cost: 325, icon: 'box', description: 'Mouse óptico de uso diario con conexión inalámbrica.' }
  ];
  const money = value => `C$ ${new Intl.NumberFormat('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
  const statusOf = product => product.units === 0 ? 'empty' : product.units <= 5 ? 'low' : 'available';
  const statusNames = { available: 'Disponible', low: 'Stock bajo', empty: 'Agotado' };
  const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const inventoryValue = () => products.reduce((sum, product) => sum + product.units * product.cost, 0);
  // Las tarjetas se calculan desde el catálogo para que siempre coincidan con la tabla.
  const renderSummary = () => {
    const low = products.filter(product => statusOf(product) === 'low').length;
    const empty = products.filter(product => statusOf(product) === 'empty').length;
    const categories = new Set(products.map(product => product.category)).size;
    document.querySelector('#summary-products').textContent = products.length;
    document.querySelector('#summary-categories').textContent = `En ${categories} ${categories === 1 ? 'categoría' : 'categorías'} de productos`;
    document.querySelector('#summary-units').textContent = new Intl.NumberFormat('es-NI').format(products.reduce((sum, product) => sum + product.units, 0));
    document.querySelector('#summary-value').textContent = `C$ ${new Intl.NumberFormat('es-NI', { maximumFractionDigits: 0 }).format(inventoryValue())}`;
    document.querySelector('#summary-attention').innerHTML = `${low + empty} <span class="inventory-value-suffix">${low + empty === 1 ? 'producto' : 'productos'}</span>`;
    document.querySelector('#summary-attention-detail').textContent = `${low} con stock bajo · ${empty} ${empty === 1 ? 'agotado' : 'agotados'}`;
  };
  const search = document.querySelector('#inventory-search');
  const category = document.querySelector('#inventory-category');
  const status = document.querySelector('#inventory-status');
  const render = () => {
    const term = normalize(search.value.trim());
    const filtered = products.filter(product => normalize(`${product.name} ${product.sku}`).includes(term) && (category.value === 'all' || product.category === category.value) && (status.value === 'all' || (status.value === 'attention' ? product.units <= 5 : statusOf(product) === status.value)));
    document.querySelector('#inventory-rows').innerHTML = filtered.map(product => {
      const state = statusOf(product);
      return `<tr><td><div class="inventory-product"><span class="product-illustration ${product.category === 'Tecnología' ? 'tech' : product.category === 'Accesorios' ? 'accessory' : ''}">${window.Finora.icon(product.icon)}</span><div><span class="cell-main">${product.name}</span><span class="cell-sub">${product.sku}</span></div></div></td><td>${product.category}</td><td class="table-number"><span class="inventory-stock">${product.units}</span><span class="stock-unit">uds.</span></td><td class="table-number">${money(product.cost)}</td><td class="table-number">${money(product.units * product.cost)}</td><td><span class="stock-badge ${state}"><span></span>${statusNames[state]}</span></td><td><button class="product-detail-button" type="button" data-product="${product.sku}" aria-label="Ver detalle de ${product.name}">${window.Finora.icon('chevron-right')}</button></td></tr>`;
    }).join('');
    document.querySelector('#inventory-empty').hidden = filtered.length > 0;
    document.querySelector('#inventory-count').textContent = `Mostrando ${filtered.length} de ${products.length} productos`;
  };
  search.addEventListener('input', render); category.addEventListener('change', render); status.addEventListener('change', render);
  document.querySelector('#reset-inventory').addEventListener('click', () => { search.value = ''; category.value = 'all'; status.value = 'all'; render(); search.focus(); });
  document.querySelector('#show-low-stock').addEventListener('click', () => { search.value = ''; category.value = 'all'; status.value = 'attention'; render(); document.querySelector('.inventory-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }); status.focus({ preventScroll: true }); });
  document.querySelector('#inventory-rows').addEventListener('click', event => {
    const button = event.target.closest('[data-product]'); if (!button) return;
    const product = products.find(item => item.sku === button.dataset.product);
    const state = statusOf(product);
    window.Finora.openDialog(product.name, `<p class="inventory-detail-description">${product.description}</p><span class="stock-badge ${state}"><span></span>${statusNames[state]}</span><dl class="inventory-details"><div><dt>Código / SKU</dt><dd>${product.sku}</dd></div><div><dt>Categoría</dt><dd>${product.category}</dd></div><div><dt>Existencias</dt><dd>${product.units} unidades</dd></div><div><dt>Costo unitario</dt><dd>${money(product.cost)}</dd></div><div><dt>Valor del inventario</dt><dd>${money(product.cost * product.units)}</dd></div><div><dt>Ubicación</dt><dd>Almacén principal</dd></div></dl><p class="note">Producto ficticio para explorar el diseño del inventario.</p>`);
  });
  document.querySelector('#inventory-guide').addEventListener('click', () => window.Finora.openDialog('El valor de tu inventario', `<p>En esta vista, el valor de cada producto es su <strong>costo unitario × unidades disponibles</strong>.</p><p>Por ejemplo, 12 escritorios a C$ 3,250.00 suman <strong>C$ 39,000.00</strong>. La suma de los ${products.length} productos del catálogo es ${money(inventoryValue())}.</p><p class="note">Ejemplo visual con costos ficticios. No incluye métodos contables de valoración ni movimientos de almacén.</p>`));
  const draft = document.querySelector('#inventory-draft');
  document.querySelector('#add-product').addEventListener('click', () => { draft.hidden = false; draft.scrollIntoView({ behavior: 'smooth', block: 'center' }); draft.querySelector('input').focus({ preventScroll: true }); });
  document.querySelector('#product-cancel').addEventListener('click', () => { draft.hidden = true; document.querySelector('#add-product').focus(); });
  document.querySelector('#product-form').addEventListener('submit', event => { event.preventDefault(); window.Finora.toast('Formulario probado. El producto no se guardó: este catálogo es de demostración.'); });
  renderSummary();
  render();
})();
