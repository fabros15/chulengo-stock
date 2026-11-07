// ═══ Presupuesto libre ═══
// Armar un presupuesto escribiendo los productos y precios a mano, sin la calculadora.
// Usa el mismo modal, el mismo diseño de PDF y el mismo historial que los presupuestos de la calculadora.
(function(){
  var filas = [];   // [{nombre, cant, unit}]
  window._presupuestoLibre = false;

  function $(id){ return document.getElementById(id); }
  function num(v){ var n=parseFloat(String(v==null?'':v).replace(/\./g,'').replace(',','.')); return isNaN(n)?0:n; }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function peso(n){ return (typeof fmtPeso==='function') ? fmtPeso(n) : '$ '+Math.round(n||0); }

  function campo(id){ var el=$(id); return el ? (el.closest('.field')||el) : null; }

  function asegurarCaja(){
    if($('pdf-libre-box')) return;
    var box=document.createElement('div');
    box.id='pdf-libre-box'; box.className='field'; box.style.display='none';
    box.innerHTML=
      '<label>Productos</label>'+
      '<div class="pl-cab"><span>Descripción</span><span>Cant.</span><span>Precio unit.</span><span style="text-align:right">Importe</span><span></span></div>'+
      '<div id="pdf-libre-filas"></div>'+
      '<button type="button" id="pdf-libre-add" class="pl-add">+ Agregar producto</button>'+
      '<div class="pl-total"><span>Total</span><b id="pdf-libre-total">$ 0</b></div>'+
      '<style>'+
      '.pl-cab,.pl-fila{display:grid;grid-template-columns:minmax(0,1fr) 66px 96px 86px 26px;gap:6px;align-items:center}'+
      '.pl-cab{font-size:0.68rem;font-weight:700;color:#8A8479;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px}'+
      '.pl-fila{margin-bottom:6px}'+
      '.pl-fila input{width:100%;padding:8px 9px;border:1.5px solid #E2DDD6;border-radius:8px;font-size:0.88rem;font-family:Inter,sans-serif;box-sizing:border-box;min-width:0}'+
      '.pl-imp{text-align:right;font-size:0.85rem;font-weight:700;color:#2D6A4F;font-variant-numeric:tabular-nums}'+
      '.pl-x{background:none;border:none;color:#DC2626;cursor:pointer;font-size:0.85rem;padding:4px}'+
      '.pl-add{width:100%;padding:8px;background:#F5F2ED;border:1.5px dashed #D4CFC8;border-radius:8px;font-size:0.82rem;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;color:#1A1814}'+
      '.pl-total{display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding:10px 12px;background:#EFF6F1;border-radius:8px;font-size:0.9rem;font-family:Inter,sans-serif}'+
      '.pl-total b{color:#2D6A4F;font-size:1.05rem}'+
      '@media(max-width:600px){.pl-cab{display:none}.pl-fila{grid-template-columns:62px minmax(0,1fr) 26px;padding-bottom:8px;border-bottom:1px solid #F0ECE6}'+
      '.pl-fila > :nth-child(1){grid-column:1 / 3}.pl-fila > :nth-child(5){grid-column:3;grid-row:1}.pl-fila > :nth-child(4){grid-column:2 / 4;text-align:left}}'+
      '</style>';
    var ref=campo('pdf-cantidad');
    var fila=ref ? ref.closest('.pdf-row2')||ref : null;
    if(fila && fila.parentNode) fila.parentNode.insertBefore(box, fila);
    $('pdf-libre-add').addEventListener('click', function(){ leer(); filas.push({nombre:'',cant:1,unit:''}); render(); var ins=document.querySelectorAll('#pdf-libre-filas [data-k="nombre"]'); if(ins.length) ins[ins.length-1].focus(); });
    $('pdf-libre-filas').addEventListener('input', function(){ leer(); totales(); });
    $('pdf-libre-filas').addEventListener('click', function(e){
      var b=e.target.closest('[data-quitar]'); if(!b) return;
      leer(); filas.splice(+b.dataset.quitar,1); if(!filas.length) filas.push({nombre:'',cant:1,unit:''}); render();
    });
  }

  function render(){
    $('pdf-libre-filas').innerHTML = filas.map(function(f,i){
      return '<div class="pl-fila">'+
        '<input data-i="'+i+'" data-k="nombre" placeholder="Ej: Trofeo personalizado" value="'+esc(f.nombre)+'">'+
        '<input data-i="'+i+'" data-k="cant" type="number" inputmode="numeric" min="1" placeholder="Cant." value="'+esc(f.cant)+'">'+
        '<input data-i="'+i+'" data-k="unit" type="number" inputmode="numeric" min="0" placeholder="$ c/u" value="'+esc(f.unit)+'">'+
        '<span class="pl-imp" data-imp="'+i+'"></span>'+
        '<button type="button" class="pl-x" data-quitar="'+i+'" title="Quitar">✕</button></div>';
    }).join('');
    totales();
  }
  function leer(){
    document.querySelectorAll('#pdf-libre-filas [data-i]').forEach(function(el){
      var f=filas[+el.dataset.i]; if(!f) return;
      f[el.dataset.k] = el.dataset.k==='nombre' ? el.value : el.value;
    });
  }
  function validas(){
    return filas.filter(function(f){ return String(f.nombre).trim() || num(f.unit); })
      .map(function(f){ var c=Math.max(1, Math.round(num(f.cant))||1), u=Math.round(num(f.unit)); return {nombre: String(f.nombre).trim()||'Producto', cant:c, unit:u}; });
  }
  function totales(){
    var tot=0;
    filas.forEach(function(f,i){ var imp=(Math.max(1,num(f.cant))||1)*num(f.unit); tot+=imp; var el=document.querySelector('[data-imp="'+i+'"]'); if(el) el.textContent=num(f.unit)?peso(imp):''; });
    $('pdf-libre-total').textContent=peso(tot);
    var pu=$('pdf-precio-unit'); if(pu){ pu.value=Math.round(tot)||''; }
    var pc=$('pdf-cantidad'); if(pc) pc.value=1;
    if(typeof actualizarDescuento==='function') actualizarDescuento();
  }

  function activar(nuevasFilas){
    asegurarCaja();
    window._presupuestoLibre = true;
    filas = nuevasFilas && nuevasFilas.length ? nuevasFilas : [{nombre:'',cant:1,unit:''}];
    $('pdf-libre-box').style.display='';
    [campo('pdf-cantidad'), campo('pdf-precio-unit')].forEach(function(el){ if(el) el.style.display='none'; });
    render();
  }
  function desactivar(){
    window._presupuestoLibre = false;
    var b=$('pdf-libre-box'); if(b) b.style.display='none';
    [campo('pdf-cantidad'), campo('pdf-precio-unit')].forEach(function(el){ if(el) el.style.display=''; });
  }

  // Abre el modal en modo libre, vacío
  window.abrirPresupuestoLibre = function(){
    if(!window.currentUser){ window._pendingLibre=true; window._pendingPDF=true; mostrarLoginModal('presupuesto'); return; }
    abrirPDFModal();
    ['pdf-proyecto','pdf-cliente','pdf-descripcion','pdf-descuento'].forEach(function(k){ var el=$(k); if(el) el.value=''; });
    var v=$('pdf-validez'); if(v && !v.value) v.value='7 días';
    activar();
    setTimeout(function(){ var c=$('pdf-cliente'); if(c) c.focus(); },50);
  };

  function envolver(){
    if(window._plListo || typeof generarPDF!=='function' || typeof abrirPDFModal!=='function') return;
    window._plListo = true;
    var abrirOrig = abrirPDFModal, cerrarOrig = cerrarPDFModal, generarOrig = generarPDF, editarOrig = editarPresupuesto;

    window.abrirPDFModal = function(){
      desactivar();
      var pend = window._pendingLibre; window._pendingLibre=false;
      abrirOrig.apply(this, arguments);
      if(pend && window.currentUser){
        ['pdf-proyecto','pdf-cliente','pdf-descripcion','pdf-descuento'].forEach(function(k){ var el=$(k); if(el) el.value=''; });
        activar();
      }
    };
    window.cerrarPDFModal = function(){ cerrarOrig.apply(this, arguments); desactivar(); };

    // Al editar cualquier presupuesto guardado, los productos se pueden tocar uno por uno
    window.editarPresupuesto = function(id, d){
      editarOrig.apply(this, arguments);
      if(!window.currentUser) return;
      var items=(d.items&&d.items.length)?d.items:[{nombre:d.proyecto||'', precio:d.precioTotal||0, cant:d.cantidad||1}];
      var esLista=items.length>1 || (items.length===1 && items[0].nombre!==(d.proyecto||''));
      var nf;
      if(esLista) nf=items.map(function(it){ var c=it.cant||1; return {nombre:it.nombre, cant:c, unit:Math.round((it.precio||0)/c)}; });
      else { var c=d.cantidad||1; nf=[{nombre:d.proyecto||'', cant:c, unit:Math.round((d.precioTotal||0)/c)}]; }
      var desc=$('pdf-descuento') ? $('pdf-descuento').value : '';
      activar(nf);
      if($('pdf-descuento')){ $('pdf-descuento').value=desc; if(typeof actualizarDescuento==='function') actualizarDescuento(); }
    };

    window.generarPDF = function(sendWA){
      if(!window._presupuestoLibre) return generarOrig.apply(this, arguments);
      leer();
      var v=validas();
      if(!v.length){ alert('Cargá al menos un producto con su precio.'); return; }
      var proy=$('pdf-proyecto');
      if(proy && !proy.value.trim()) proy.value = v.length===1 ? v[0].nombre : (($('pdf-cliente')&&$('pdf-cliente').value.trim()) ? 'Pedido de '+$('pdf-cliente').value.trim() : 'Presupuesto');
      var resguardo = itemsPresupuesto;   // lo que haya cargado en la calculadora no se pierde
      itemsPresupuesto = v.map(function(f){ return {nombre:f.nombre, cant:f.cant, precio:f.cant*f.unit}; });
      $('pdf-precio-unit').value = itemsPresupuesto.reduce(function(a,i){ return a+i.precio; },0);
      $('pdf-cantidad').value = 1;
      try { generarOrig.call(this, sendWA); }
      finally { itemsPresupuesto = resguardo; if(typeof renderItemsPresupuesto==='function') renderItemsPresupuesto(); }
    };
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', envolver); else envolver();
})();
