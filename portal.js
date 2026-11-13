// ═══ Stock compartido del Candy (consignación con el cine) ═══
// Una tabla que ven Fabri y Rubén al mismo tiempo:
//   • Fabri da de alta en el Candy lo de cada remito que entrega → suma stock.
//   • Rubén carga al final del día el ticket con lo vendido → descuenta stock.
//   • Fabri marca cuando le pagan.
//
// Firestore:
//   consig_portal/{pid}          { cliente, titulo, emails:[], desde, items:[{id,nombre,precio,sugerido,entregadas,foto,oculto,catId}],
//                                  altas:[{id,remId,fecha,fechaRemito,lineas:[{k,nombre,cant}],por}], equipo }
//   consig_portal/{pid}/ventas   { tipo:'ticket', dia, lineas:[{k,nombre,cant,precio}], email, fecha, cobrada, anulada }
//   consig_acceso/{email}        { pid, cliente }
// Hay = entregadas − vendidas (tickets no anulados).  Para pagar = tickets no cobrados.
(function(){
  var URL_CLIENTE = 'https://fabros15.github.io/chulengo-stock/#candy';
  function db(){ return firebase.firestore(); }
  function FV(){ return firebase.firestore.FieldValue; }
  function $(id){ return document.getElementById(id); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function peso(n){ return typeof formatearMoneda==='function' ? formatearMoneda(n||0) : '$ '+Math.round(n||0).toLocaleString('es-AR'); }
  function num(v){ if(typeof v==='number') return v; var n=parseFloat(String(v==null?'':v).replace(/\$/g,'').replace(/\s/g,'').replace(/\./g,'').replace(',','.')); return isNaN(n)?0:n; }
  function cant(n){ return (Math.round(n*100)/100).toLocaleString('es-AR'); }
  function norm(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim(); }
  function nuevoId(){ return 'i'+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
  function slug(s){ return norm(s).replace(/ /g,'-') || 'cliente'; }
  function pad(n){ return ('0'+n).slice(-2); }
  function U(){ return window.cgUtil || {}; }
  function catDe(n){ return U().catDe ? U().catDe(n) : { id:'otros', ico:'🎁', nom:'Otros' }; }
  function esAdm(){ return typeof isAdmin==='function' && isAdmin(); }
  function esEquipo(){ return esAdm() || (typeof isColaborador==='function' && isColaborador()); }
  function emailAct(){ var u=firebase.auth().currentUser; return u && u.email ? u.email.toLowerCase() : ''; }
  function aFecha(t){ var d = t && t.toDate ? t.toDate() : (t && t.seconds ? new Date(t.seconds*1000) : (t ? new Date(t) : new Date())); return isNaN(d) ? new Date() : d; }
  function fechaCorta(d){ var h=new Date(), ayer=new Date(Date.now()-864e5), hm=pad(d.getHours())+':'+pad(d.getMinutes());
    if(d.toDateString()===h.toDateString()) return 'Hoy '+hm; if(d.toDateString()===ayer.toDateString()) return 'Ayer '+hm;
    return pad(d.getDate())+'/'+pad(d.getMonth()+1)+' '+hm; }
  function diaHoy(){ var d=new Date(); return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
  function diaTxt(s){ var p=String(s||'').split('-'); return p.length===3 ? p[2]+'/'+p[1]+'/'+p[0] : s; }
  function tituloDe(cliente){ var c=String(cliente||'').toLowerCase(); if(/cine/.test(c)) return 'el Candy'; return c.replace(/\b\w/g,function(x){return x.toUpperCase();}); }
  function errPermiso(e){ return /permission|insufficient/i.test((e&&e.message)||''); }
  function cantRenglon(r){ return (typeof parseNumeroRemito==='function' ? parseNumeroRemito(r.cantidad||'1') : num(r.cantidad)) || 1; }

  // ── Datos en vivo ──
  var P = { pid:null, doc:null, ventas:[], cargando:false, err:null, unsubD:null, unsubV:null };
  function desuscribir(){ if(P.unsubD) P.unsubD(); if(P.unsubV) P.unsubV(); P.unsubD=P.unsubV=null; P.pid=null; P.doc=null; P.ventas=[]; }
  function suscribir(pid){
    if(P.pid===pid && P.unsubD) return;
    desuscribir();
    P.pid=pid; P.cargando=true; P.err=null;
    var ref=db().collection('consig_portal').doc(pid);
    P.unsubD = ref.onSnapshot(function(s){ P.doc = s.exists ? s.data() : null; P.cargando=false; P.err=null; avisar(); },
                              function(e){ P.err=e; P.cargando=false; avisar(); });
    P.unsubV = ref.collection('ventas').onSnapshot(function(s){
      P.ventas = s.docs.map(function(d){ var x=d.data({serverTimestamps:'estimate'}); x.id=d.id; return x; });
      avisar();
    }, function(e){ P.err=e; avisar(); });
  }
  function items(){ return (P.doc && Array.isArray(P.doc.items)) ? P.doc.items : []; }
  function altas(){ return (P.doc && Array.isArray(P.doc.altas)) ? P.doc.altas : []; }
  function lineasDe(v){ return Array.isArray(v.lineas) ? v.lineas : [{ k:v.k, nombre:v.nombre, cant:v.cant, precio:v.precio }]; }
  function totalTicket(v){ var u=0,m=0; lineasDe(v).forEach(function(l){ u+=num(l.cant); m+=num(l.cant)*num(l.precio); }); return {u:u,m:m}; }
  function resumen(){
    var por={}, tot={u:0,m:0};
    items().forEach(function(it){ por[it.id]={vend:0,sinCob:0}; });
    P.ventas.forEach(function(v){
      if(v.anulada) return;
      lineasDe(v).forEach(function(l){
        var x = por[l.k] || (por[l.k]={vend:0,sinCob:0}), c=num(l.cant);
        x.vend += c;
        if(!v.cobrada){ x.sinCob += c; tot.u += c; tot.m += c*num(l.precio); }
      });
    });
    return { por:por, tot:tot };
  }
  function hayDe(it, r){ return Math.max(0, num(it.entregadas) - ((r.por[it.id]||{}).vend||0)); }
  function vendidasDe(id){ var t=0; P.ventas.forEach(function(v){ if(v.anulada) return; lineasDe(v).forEach(function(l){ if(l.k===id) t+=num(l.cant); }); }); return t; }

  // ── Remitos del cliente que todavía no se dieron de alta ──
  function remitosPendientes(todos){
    if(!P.doc || typeof remitosHistorialCache==='undefined') return [];
    var cli=String(P.doc.cliente||'').trim().toUpperCase(), hechos={}, desde=num(P.doc.desde);
    altas().forEach(function(a){ hechos[a.remId]=1; });
    return remitosHistorialCache.filter(function(r){
      if(String(r.cliente||'').trim().toUpperCase()!==cli || hechos[r.id]) return false;
      if(todos) return true;
      var creado = r.fecha && r.fecha.toMillis ? r.fecha.toMillis() : (typeof fechaRemitoMs==='function' ? fechaRemitoMs(r) : 0);
      return !desde || creado >= desde;
    }).sort(function(a,b){ return (typeof fechaRemitoMs==='function'?fechaRemitoMs(b)-fechaRemitoMs(a):0); });
  }
  function itemDeNombre(nombre){
    var n=norm(nombre), its=items();
    var it=its.find(function(x){ return norm(x.nombre)===n; });
    if(it) return it;
    var c=delCatalogo(P.doc && P.doc.cliente, nombre);
    if(c) return its.find(function(x){ return x.catId===c.id || norm(x.nombre)===norm(c.nombre); }) || null;
    return null;
  }
  function previaRemito(rem){
    return (rem.renglones||[]).filter(function(r){ return String(r.producto||'').trim(); }).map(function(r){
      var c=cantRenglon(r), it=itemDeNombre(r.producto), cat=it?null:delCatalogo(P.doc.cliente, r.producto);
      return { r:r, cant:c, it:it, cat:cat, nombre: it ? it.nombre : ((cat&&cat.nombre) || String(r.producto).trim()), precio:(r.subtotal||0)/c };
    });
  }
  function darDeAlta(rem){
    var its=items(), lineas=[];
    previaRemito(rem).forEach(function(x){
      var it=x.it || its.find(function(y){ return norm(y.nombre)===norm(x.nombre); });
      if(!it){
        var c=x.cat||{};
        it={ id:nuevoId(), nombre:x.nombre, precio:Math.round(x.precio), sugerido:num(c.sugerido), foto:c.foto||'', entregadas:0, oculto:false };
        if(c.id) it.catId=c.id;
        its.push(it);
      }
      it.entregadas = num(it.entregadas) + x.cant; it.oculto=false;
      if(!num(it.precio) && x.precio) it.precio=Math.round(x.precio);
      lineas.push({ k:it.id, nombre:it.nombre, cant:x.cant });
    });
    var a=altas().slice();
    a.push({ id:nuevoId(), remId:rem.id, fechaRemito:rem.fechaEntrega||'', fecha:Date.now(), lineas:lineas, por:emailAct() });
    P.doc.items=its; P.doc.altas=a;
    avisar();
    return db().collection('consig_portal').doc(P.pid).update({ items:JSON.parse(JSON.stringify(its)), altas:a, actualizado:FV().serverTimestamp() });
  }

  var tAvisar=null;
  function avisar(){
    clearTimeout(tAvisar);
    tAvisar=setTimeout(function(){
      actualizarTarjeta();
      var act=document.activeElement;
      var escribiendo = act && act.closest && act.closest('#pt-overlay') && /INPUT|SELECT|TEXTAREA/.test(act.tagName) && act.id!=='cs-buscar';
      if($('pt-overlay') && !escribiendo) pintar();
      if(typeof remNav!=='undefined' && (remNav.tipo==='portal' || remNav.tipo==='remito')){
        if(act && act.closest && act.closest('.pt-adm') && /INPUT|TEXTAREA|SELECT/.test(act.tagName)){ A.pendiente=true; return; }
        renderHistorialRemitos();
      }
    }, 30);
  }
  function actualizarTarjeta(){
    var el=$('candy-card-desc'); if(!el || !P.doc) return;
    var r=resumen();
    el.textContent = r.tot.u ? 'Vendido sin cobrar: '+cant(r.tot.u)+' productos · '+peso(r.tot.m)+'.' : 'Todo cobrado. Mirá lo que queda en el Candy.';
  }

  // ═════════ Página compartida (Rubén y Fabri) ═════════
  // V.modo: 'login' | 'sinAcceso' | 'cliente' | 'equipo';  V.pantalla: 'tabla' | 'ticket' | 'altas'
  var V = { modo:null, pantalla:'tabla', filtro:'', ticket:{}, dia:'', remAbierto:null, verTodos:false, aviso:null, verMovs:false, cliente:null };

  function abrirOverlay(modo){
    V.modo=modo; V.pantalla='tabla'; V.filtro=''; V.ticket={}; V.remAbierto=null; V.aviso=null;
    var ov=$('pt-overlay');
    if(!ov){ ov=document.createElement('div'); ov.id='pt-overlay'; ov.className='cs'; document.body.appendChild(ov); }
    document.body.classList.add('pt-abierto');
    V.comoRuben=false;
    ov.classList.toggle('con-tabs', modo==='equipo');
    pintar(); ov.scrollTop=0;
  }
  function cerrarOverlay(){ var ov=$('pt-overlay'); if(ov) ov.remove(); document.body.classList.remove('pt-abierto'); V.modo=null;
    if(/^#candy/i.test(location.hash||'')) history.replaceState(null,'',location.pathname+location.search); }
  function irA(p){ V.pantalla=p; V.filtro=''; pintar(); var ov=$('pt-overlay'); if(ov) ov.scrollTop=0; }

  function barra(){
    var t = P.doc ? (P.doc.titulo||tituloDe(P.doc.cliente)) : 'el Candy';
    return '<header class="cs-top"><div class="cs-top-in">'+
      '<div class="cs-marca"><img src="img/CHULENGO_LOGOO.png" alt=""><div><b>Chulengo Estudio</b><span>Stock en '+esc(t)+'</span></div></div>'+
      '<div class="cs-top-r">'+(emailAct()?'<span class="cs-user">'+esc(emailAct())+'</span>':'')+
        (V.modo==='equipo'?'<button type="button" class="cs-btn ghost" data-pt="cerrar">Cerrar</button>':'')+
        (V.modo==='cliente'?'<button type="button" class="cs-btn ghost" data-pt="salir-cuenta">Salir</button>':'')+
      '</div></div>'+tabsHtml()+'</header>';
  }
  var TABS=[['tabla','📦','Stock <em>lo ve Rubén</em>'],['metricas','📊','Métricas'],['produccion','🖨️','Producción'],['altas','📥','Entregas'],['ajustes','⚙️','Productos y acceso']];
  function tabsHtml(){
    if(V.modo!=='equipo' || !P.doc) return '';
    var act = V.pantalla==='ticket' ? 'tabla' : V.pantalla;
    return '<nav class="cs-tabs"><div class="cs-tabs-in">'+TABS.map(function(t){ return '<button type="button" class="'+(act===t[0]?'on':'')+'" data-pt="tab" data-p="'+t[0]+'"><i>'+t[1]+'</i>'+t[2]+'</button>'; }).join('')+'<button type="button" class="cs-tab-ruben" data-pt="como-ruben"><i>👁</i>Ver como Rubén</button></div></nav>';
  }
  function titulo(t, sub, back){ return '<div class="cs-titulo">'+(back?'<button type="button" class="cs-btn" data-pt="a-tabla">← Volver</button>':'')+'<div><h2>'+t+'</h2>'+(sub?'<p class="cs-sub">'+sub+'</p>':'')+'</div></div>'; }
  function caja(titulo, cuerpo){ return '<div class="cs-in"><div class="cs-card cs-msg"><h2>'+titulo+'</h2>'+cuerpo+'</div></div>'; }

  function htmlPantalla(){
    if(V.modo==='login') return barra()+caja('Entrá para ver el stock',
      '<p>Entrá con la cuenta de Google que le pasaste a Chulengo Estudio.</p><button type="button" class="cs-btn primario grande" data-pt="login">Entrar con Google</button>'+
      '<p class="cs-gris" style="margin-top:14px">Se hace una sola vez; después queda abierto en este dispositivo.</p>');
    if(V.modo==='sinAcceso') return barra()+caja('Esta cuenta no tiene acceso',
      '<p>Entraste con <b>'+esc(emailAct())+'</b>. Pedile a Chulengo Estudio que habilite este correo.</p><button type="button" class="cs-btn" data-pt="salir-cuenta">Entrar con otra cuenta</button>');
    if(P.err) return barra()+caja('No se pudo cargar',
      '<p>'+(errPermiso(P.err)?'La cuenta no tiene permiso o faltan las reglas de Firebase.':'Revisá la conexión a internet.')+'</p><button type="button" class="cs-btn" data-pt="recargar">Reintentar</button>');
    if(P.cargando) return barra()+caja('Cargando…','<p class="cs-gris">Un momento.</p>');
    if(!P.doc){
      if(V.modo!=='equipo') return barra()+caja('Todavía no hay stock cargado','<p>Chulengo Estudio todavía no armó la tabla.</p>');
      return barra()+caja('Todavía no armaste la tabla del Candy',
        '<p>Se crea vacía y después cargás el stock que contó Rubén (pegando las columnas del Excel). Desde ahí, cada remito nuevo se da de alta con un botón.</p>'+
        '<button type="button" class="cs-btn primario" data-pt="crear">Crear la tabla</button>');
    }
    if(V.pantalla==='metricas' && window.ptMetricas) return barra()+window.ptMetricas.html();
    if(V.pantalla==='produccion' && window.ptProduccion) return barra()+window.ptProduccion.html();
    if(V.pantalla==='ajustes' && V.modo==='equipo') return barra()+'<div class="cs-in cs-adm">'+titulo('Productos y acceso','Los productos que ve Rubén, sus precios y fotos, quién puede entrar y el stock contado.')+renderAdmin(P.doc.cliente)+'</div>';
    if(V.pantalla==='ticket') return barra()+htmlTicket();
    if(V.pantalla==='altas') return barra()+htmlAltas();
    return barra()+htmlTabla();
  }

  function htmlTabla(){
    var r=resumen(), q=norm(V.filtro), its=items().filter(function(it){ return !it.oculto; }), totHay=0;
    its.forEach(function(it){ totHay+=hayDe(it,r); });
    var pend = V.modo==='equipo' ? remitosPendientes(false) : [];
    var ult = null;
    P.ventas.forEach(function(v){ var d=aFecha(v.fecha); if(!ult||d>ult) ult=d; });
    altas().forEach(function(a){ var d=new Date(a.fecha); if(!ult||d>ult) ult=d; });

    var h='<div class="cs-in">'+titulo('Stock en '+esc(P.doc.titulo||tituloDe(P.doc.cliente)), V.modo==='equipo'?'Lo que hay ahora en el Candy, lo vendido sin pagar y cada movimiento. Es lo mismo que ve Rubén.':'Lo que hay de cada producto y lo que vendiste sin pagar. Al final del día cargá el ticket.');
    if(V.aviso) h+='<div class="cs-ok">'+esc(V.aviso)+'</div>';
    h+='<div class="cs-kpis">'+
      '<div class="cs-kpi destacado"><span>Para pagar a Chulengo</span><b>'+peso(r.tot.m)+'</b><small>'+cant(r.tot.u)+' productos vendidos sin pagar</small></div>'+
      '<div class="cs-kpi"><span>Unidades en el Candy</span><b>'+cant(totHay)+'</b><small>'+its.length+' productos</small></div>'+
      '<div class="cs-kpi"><span>Último movimiento</span><b class="chico">'+(ult?fechaCorta(ult):'—')+'</b><small>&nbsp;</small></div>'+
    '</div>';

    h+='<div class="cs-acciones">'+
      (V.modo==='cliente'?'<button type="button" class="cs-btn primario" data-pt="a-ticket">🧾 Cargar ticket del día</button>':'')+
      (V.modo==='equipo'?(r.tot.u?'<button type="button" class="cs-btn primario" data-pt="cobrar">💰 Me pagó '+peso(r.tot.m)+'</button>':'')+
        (pend.length?'<button type="button" class="cs-btn" data-pt="tab" data-p="altas">📥 '+pend.length+' remito'+(pend.length===1?'':'s')+' para dar de alta</button>':'')+'<button type="button" class="cs-btn" data-pt="como-ruben">👁 Ver como Rubén</button>':'')+
      '<button type="button" class="cs-btn ghost" data-pt="excel">⬇ Excel</button>'+
    '</div>';

    h+='<div class="cs-card"><div class="cs-card-h"><h3>Stock</h3>'+(its.length>8?'<input id="cs-buscar" class="cs-input" placeholder="Buscar producto…" value="'+esc(V.filtro)+'">':'')+'</div>';
    if(!its.length){
      h+='<div class="cs-vacio">No hay productos cargados.'+(V.modo==='equipo'?' Usá <b>⚙️ Productos y acceso → Cargar stock contado</b> o dá de alta un remito.':'')+'</div>';
    } else {
      var lista=its.map(function(it){ return { it:it, hay:hayDe(it,r), sc:Math.max(0,(r.por[it.id]||{}).sinCob||0) }; })
        .filter(function(x){ return !q || norm(x.it.nombre).indexOf(q)!==-1; })
        .sort(function(a,b){ return (a.hay>0?0:1)-(b.hay>0?0:1) || a.it.nombre.localeCompare(b.it.nombre); });
      h+='<table class="cs-tabla cs-tabla-stock"><thead><tr><th>Producto</th><th class="n">Precio</th><th class="n">Hay</th><th class="n"><span class="cs-lg">Vendidos sin pagar</span><span class="cs-sm">Sin pagar</span></th></tr></thead><tbody>';
      lista.forEach(function(x){
        h+='<tr class="'+(x.hay===0?'agotado':'')+'"><td><div class="cs-prod">'+
            (x.it.foto?'<img src="'+esc(x.it.foto)+'" alt="">':'<span class="cs-ico">'+catDe(x.it.nombre).ico+'</span>')+
            '<div><b>'+esc(x.it.nombre)+'</b>'+(num(x.it.sugerido)?'<small>Venta al público '+peso(num(x.it.sugerido))+'</small>':'')+'</div></div></td>'+
          '<td class="n" data-l="Precio">'+(num(x.it.precio)?peso(num(x.it.precio)):'—')+'</td>'+
          '<td class="n hay">'+(x.hay===0?'<span class="cs-cero">Agotado</span>':cant(x.hay))+'</td>'+
          '<td class="n">'+(x.sc?'<b>'+cant(x.sc)+'</b><small class="blq">'+peso(x.sc*num(x.it.precio))+'</small>':'<span class="cs-gris">—</span>')+'</td></tr>';
      });
      if(!lista.length) h+='<tr><td colspan="4" class="cs-vacio">No hay productos con ese nombre.</td></tr>';
      h+='</tbody></table>';
    }
    h+='</div>';

    // Movimientos
    var movs=[];
    P.ventas.forEach(function(v){ movs.push({ d:aFecha(v.fecha), tipo:'ticket', v:v, t:totalTicket(v) }); });
    altas().forEach(function(a){ var u=0; a.lineas.forEach(function(l){ u+=num(l.cant); }); movs.push({ d:new Date(a.fecha), tipo:'alta', a:a, u:u }); });
    movs.sort(function(a,b){ return b.d-a.d; });
    if(movs.length){
      var mostrar = V.verMovs ? movs : movs.slice(0,12);
      h+='<div class="cs-card"><div class="cs-card-h"><h3>Movimientos</h3></div><div class="cs-movs">';
      mostrar.forEach(function(m){
        if(m.tipo==='alta'){
          h+='<div class="cs-mov"><span class="cs-tag azul">Entrega</span><div class="cs-mov-t"><b>Remito'+(m.a.fechaRemito?' del '+esc(m.a.fechaRemito):'')+'</b><small>'+esc(m.a.lineas.map(function(l){ return cant(l.cant)+' '+l.nombre; }).join(' · '))+'</small></div><div class="cs-mov-r"><b>+'+cant(m.u)+' u.</b><small>'+fechaCorta(m.d)+'</small></div></div>';
        } else {
          var v=m.v, puede = !v.cobrada && !v.anulada && V.modo==='cliente' && v.email===emailAct();
          h+='<div class="cs-mov'+(v.anulada?' anulado':'')+'"><span class="cs-tag '+(v.anulada?'gris">Anulado':v.cobrada?'verde">Pagado':'rojo">Sin pagar')+'</span>'+
            '<div class="cs-mov-t"><b>Ticket'+(v.dia?' del '+diaTxt(v.dia):'')+'</b><small>'+esc(lineasDe(v).map(function(l){ return cant(l.cant)+' '+l.nombre; }).join(' · '))+'</small></div>'+
            '<div class="cs-mov-r"><b>−'+cant(m.t.u)+' u. · '+peso(m.t.m)+'</b><small>'+fechaCorta(m.d)+(puede?' · <button type="button" class="cs-link" data-pt="anular" data-id="'+esc(v.id)+'">Anular</button>':'')+'</small></div></div>';
        }
      });
      if(movs.length>12 && !V.verMovs) h+='<button type="button" class="cs-btn ghost" style="margin-top:8px" data-pt="ver-movs">Ver todos ('+movs.length+')</button>';
      h+='</div></div>';
    }
    return h+'</div>';
  }

  function htmlTicket(){
    var r=resumen(), q=norm(V.filtro), its=items().filter(function(it){ return !it.oculto; });
    var lista=its.map(function(it){ return { it:it, hay:hayDe(it,r) }; })
      .sort(function(a,b){ return (a.hay>0?0:1)-(b.hay>0?0:1) || a.it.nombre.localeCompare(b.it.nombre); });
    var h='<div class="cs-in">'+
      titulo('Cargar ticket del día','Poné cuántos se vendieron de cada producto según el ticket de hoy.',true)+
      '<div class="cs-card"><div class="cs-ticket-cab"><label>Fecha del ticket <input type="date" id="cs-dia" class="cs-input" value="'+esc(V.dia||diaHoy())+'"></label>'+
        '<p class="cs-gris">Completá cuántos se vendieron de cada producto. Los que no se vendieron dejalos en 0.</p>'+
        (its.length>8?'<input id="cs-buscar" class="cs-input" placeholder="Buscar producto…" value="'+esc(V.filtro)+'">':'')+'</div>'+
      '<table class="cs-tabla cs-tabla-ticket"><thead><tr><th>Producto</th><th class="n">Hay</th><th class="n">Vendidos</th></tr></thead><tbody>';
    lista.forEach(function(x){
      var oc = q && norm(x.it.nombre).indexOf(q)===-1, v=V.ticket[x.it.id]||0, sin=x.hay===0&&!v;
      h+='<tr'+(oc?' style="display:none"':'')+' class="'+(x.hay===0?'agotado':'')+(v?' marcado':'')+'"><td><div class="cs-prod">'+
          (x.it.foto?'<img src="'+esc(x.it.foto)+'" alt="">':'<span class="cs-ico">'+catDe(x.it.nombre).ico+'</span>')+
          '<div><b>'+esc(x.it.nombre)+'</b><small>'+(num(x.it.precio)?peso(num(x.it.precio)):'')+'</small></div></div></td>'+
        '<td class="n">'+cant(x.hay)+'</td>'+
        '<td class="n"><div class="cs-step"><button type="button" data-pt="t-menos" data-k="'+x.it.id+'"'+(!v?' disabled':'')+'>−</button>'+
          '<input class="cs-num" inputmode="numeric" data-k="'+x.it.id+'" data-max="'+x.hay+'" value="'+(v||'')+'" placeholder="0"'+(sin?' disabled':'')+'>'+
          '<button type="button" data-pt="t-mas" data-k="'+x.it.id+'"'+(v>=x.hay?' disabled':'')+'>+</button></div></td></tr>';
    });
    h+='</tbody></table></div></div>'+
      '<div class="cs-pie"><div class="cs-pie-in"><div id="cs-pie-txt">'+textoPie()+'</div>'+
      '<button type="button" class="cs-btn primario" data-pt="guardar-ticket">Guardar ticket</button></div></div>';
    return h;
  }
  function textoPie(){
    var u=0,m=0; items().forEach(function(it){ var c=V.ticket[it.id]||0; u+=c; m+=c*num(it.precio); });
    return u ? '<b>'+cant(u)+' productos vendidos</b><span>'+peso(m)+' para Chulengo</span>' : '<b>Ningún producto cargado</b><span>Completá los vendidos</span>';
  }

  function htmlAltas(){
    var pend=remitosPendientes(V.verTodos);
    var h='<div class="cs-in">'+titulo('Entregas', 'Cada remito que le hacés al cine aparece acá. Al darlo de alta, sus productos se suman al stock del Candy.', true);
    if(typeof remitosHistorialCache==='undefined' || !remitosHistorialCache.length) h+='<div class="cs-card cs-vacio">Cargando remitos…</div>';
    else if(!pend.length) h+='<div class="cs-card cs-vacio">No hay remitos pendientes'+(V.verTodos?'':' desde que armaste la tabla')+'.</div>';
    pend.forEach(function(rem){
      var pv=previaRemito(rem), u=0; pv.forEach(function(x){ u+=x.cant; });
      var ab=V.remAbierto===rem.id;
      h+='<div class="cs-card cs-rem'+(ab?' abierto':'')+'"><button type="button" class="cs-rem-h" data-pt="rem-abrir" data-id="'+esc(rem.id)+'">'+
        '<div><b>Remito del '+esc(rem.fechaEntrega||'—')+'</b><small>'+pv.length+' productos · '+cant(u)+' unidades</small></div><span>'+(ab?'▴':'▾')+'</span></button>';
      if(ab){
        h+='<table class="cs-tabla"><thead><tr><th>En el remito</th><th>Se suma a</th><th class="n">Cant.</th></tr></thead><tbody>'+
          pv.map(function(x){ return '<tr><td>'+esc(String(x.r.producto).trim())+'</td><td>'+(x.it?esc(x.it.nombre):'<span class="cs-tag azul">Nuevo</span> '+esc(x.nombre))+'</td><td class="n"><b>+'+cant(x.cant)+'</b></td></tr>'; }).join('')+
          '</tbody></table><div class="cs-rem-acc"><button type="button" class="cs-btn primario" data-pt="alta" data-id="'+esc(rem.id)+'">Dar de alta en el Candy</button></div>';
      }
      h+='</div>';
    });
    if(!V.verTodos) h+='<button type="button" class="cs-btn ghost" data-pt="ver-todos">Mostrar también remitos anteriores</button>';
    return h+'</div>';
  }

  function pintar(){
    var ov=$('pt-overlay'); if(!ov) return;
    var act=document.activeElement, enBuscar = act && act.id==='cs-buscar', pos = enBuscar ? act.selectionStart : 0, sc=ov.scrollTop;
    if(V.comoRuben && V.modo==='equipo'){
      if(V.pantalla!=='tabla' && V.pantalla!=='ticket') V.pantalla='tabla';
      V.modo='cliente';
      try{ ov.innerHTML = '<div class="cs-preview"><span>👁 Estás viendo <b>exactamente lo que ve Rubén</b>. Nada de lo que toques acá se guarda.</span><button type="button" class="cs-btn" data-pt="como-yo">Volver a mi vista</button></div>'+htmlPantalla(); }
      finally{ V.modo='equipo'; }
    } else ov.innerHTML = htmlPantalla();
    ov.scrollTop=sc;
    if(enBuscar){ var nb=$('cs-buscar'); if(nb){ nb.focus(); try{ nb.setSelectionRange(pos,pos); }catch(_){} } }
  }

  function descargarExcel(){
    var r=resumen(), filas=[['Producto','Hay','Vendidos sin pagar','Precio a Chulengo','A pagar']];
    items().filter(function(it){ return !it.oculto; }).forEach(function(it){
      var sc=Math.max(0,(r.por[it.id]||{}).sinCob||0);
      filas.push([it.nombre, hayDe(it,r), sc, num(it.precio), sc*num(it.precio)]);
    });
    filas.push(['TOTAL','',r.tot.u,'',r.tot.m]);
    var csv='﻿'+filas.map(function(f){ return f.map(function(c){ c=String(c); return /[;"\n]/.test(c)?'"'+c.replace(/"/g,'""')+'"':c; }).join(';'); }).join('\r\n');
    var d=new Date(), a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    a.download='Stock Candy - '+pad(d.getDate())+'-'+pad(d.getMonth()+1)+'-'+d.getFullYear()+'.csv';
    document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function loginGoogle(){
    var prov=new firebase.auth.GoogleAuthProvider();
    firebase.auth().signInWithPopup(prov).catch(function(e){
      if(/popup|operation-not-supported|web-storage/i.test((e&&e.code)||'')) firebase.auth().signInWithRedirect(prov);
      else if(!/cancelled|closed-by-user/i.test((e&&e.code)||'')) alert('No se pudo entrar: '+e.message);
    });
  }
  function avisoOk(t){ V.aviso=t; setTimeout(function(){ if(V.aviso===t){ V.aviso=null; pintar(); } }, 4000); }

  // ── Fotos ──
  var fotoPend=null;
  function pedirFoto(id){
    var inp=$('pt-foto-in');
    if(!inp){
      inp=document.createElement('input'); inp.type='file'; inp.accept='image/*'; inp.id='pt-foto-in'; inp.style.display='none';
      document.body.appendChild(inp);
      inp.addEventListener('change', function(){
        var f=inp.files&&inp.files[0], k=fotoPend; inp.value=''; fotoPend=null;
        if(!f||!k||!U().achicarFoto) return;
        U().achicarFoto(f).then(function(url){
          var it=items().find(function(x){ return x.id===k; }); if(!it) return;
          var antes=it.foto; it.foto=url;
          if(JSON.stringify(items()).length>900000){ it.foto=antes||''; alert('No entran más fotos.'); return; }
          guardarItems();
        }).catch(function(){ alert('No pude leer esa imagen. Probá con otra.'); });
      });
    }
    fotoPend=id; inp.click();
  }
  function guardarItems(){
    if(!P.pid || !P.doc) return Promise.resolve();
    var copia=JSON.parse(JSON.stringify(items()));
    avisar();
    return db().collection('consig_portal').doc(P.pid).update({ items:copia, actualizado:FV().serverTimestamp() })
      .catch(function(e){ alert('No se pudo guardar: '+e.message); });
  }
  function crearTabla(cliente){
    return db().collection('consig_portal').doc(slug(cliente)).set({ cliente:cliente, titulo:tituloDe(cliente), emails:[], items:[], altas:[], desde:Date.now(), equipo:'chulengo', creado:FV().serverTimestamp(), actualizado:FV().serverTimestamp() });
  }

  // ═════════ Productos y acceso (Fabri) ═════════
  var A = { cliente:null, abierto:null, pegar:false, texto:'', previa:null, ocultarResto:true, pendiente:false };
  function delCatalogo(cliente, nombre){
    if(!U().catalogo || !cliente) return null;
    var cat=U().catalogo(String(cliente).trim().toUpperCase());
    return (U().productoDeNombre && U().productoDeNombre(cat, nombre)) || null;
  }
  function parsearLista(txt){
    var out=[];
    String(txt||'').split(/\r?\n/).forEach(function(l){
      l=l.trim(); if(!l) return;
      var celdas=l.split(/\t|;|\s{2,}/).map(function(s){ return s.trim(); }).filter(Boolean), nombre=null, nums=[];
      if(celdas.length<2){
        var m=l.match(/^(\d+)\s*[x×-]?\s+(.+)$/i) || null;
        if(m){ nombre=m[2]; nums=[+m[1]]; }
        else { m=l.match(/^(.+?)\s*[:x×-]?\s+(\d+)$/i); if(m){ nombre=m[1]; nums=[+m[2]]; } }
      } else {
        celdas.forEach(function(c){
          var limpio=c.replace(/[$\s]/g,'').replace(/\.(?=\d{3}(\D|$))/g,'').replace(',','.');
          if(/^-?\d+(\.\d+)?$/.test(limpio)) nums.push(parseFloat(limpio)); else if(!nombre) nombre=c;
        });
      }
      if(!nombre || !nums.length || /^total/.test(norm(nombre))) return;
      var cn=nums[0], pr=nums[1]||0;
      if(nums.length>1 && nums[0]>=1000 && nums[1]<1000){ cn=nums[1]; pr=nums[0]; }
      out.push({ nombre:nombre, cant:Math.max(0,Math.round(cn)), precio:pr });
    });
    return out;
  }
  function previaLista(){
    return parsearLista(A.texto).map(function(f){
      var ex=itemDeNombre(f.nombre);
      return { f:f, ex:ex||null, cat: ex?null:delCatalogo(A.cliente, f.nombre) };
    });
  }

  function renderAdmin(cliente){
    A.cliente=cliente; suscribir(slug(cliente));
    try{ localStorage.setItem('pt-cliente', cliente); }catch(_){}
    var h='<div class="cg pt-adm"><div class="rem-ficha-top"><button type="button" class="rem-back">← Volver</button></div>'+
      '<div class="cg-tit" style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap"><div><div class="cg-h1">⚙️ Stock en '+esc(cliente)+': productos y acceso</div><div class="rem-gris">Lo que se ve en la tabla compartida con el cliente.</div></div>'+
      '<button type="button" class="cg-btn verde" data-pt="abrir-tabla">Abrir la tabla →</button></div>';
    if(P.err) return h+'<div class="cg-bloque pt-error">'+(errPermiso(P.err)?'<b>Falta pegar las reglas nuevas en Firebase.</b>':'Error: '+esc(P.err.message))+'</div></div>';
    if(P.cargando) return h+'<div class="cg-bloque">Cargando…</div></div>';
    if(!P.doc) return h+'<div class="cg-bloque"><div class="cg-bt">Todavía no creaste la tabla de este cliente</div><button type="button" class="cg-btn verde" data-pt="crear-adm">Crear la tabla</button></div></div>';
    var r=resumen(), its=items(), em=(P.doc.emails||[]);

    h+='<div class="cg-bloque"><div class="cg-bt">👤 Quién puede entrar</div>'+
      (em.length?'<div class="cg-chips" style="margin-bottom:8px">'+em.map(function(e){ return '<span class="cg-chip">'+esc(e)+' <button type="button" data-pt="quitar-mail" data-mail="'+esc(e)+'">×</button></span>'; }).join('')+'</div>'
               :'<div class="rem-gris" style="margin-bottom:8px">Nadie todavía. Agregá el Gmail del cliente.</div>')+
      '<div style="display:flex;gap:6px"><input id="pt-mail" class="cg-in" type="email" placeholder="gmail del cliente"><button type="button" class="cg-btn verde" data-pt="agregar-mail">Agregar</button></div>'+
      '<div class="rem-gris" style="margin-top:8px">Link para el cliente: <b>'+esc(URL_CLIENTE)+'</b> <button type="button" class="cg-btn" data-pt="copiar">Copiar</button></div>'+
      '<div class="cg-sub">Nombre del lugar</div><input class="cg-in" data-pt-campo="titulo" value="'+esc(P.doc.titulo||'')+'" placeholder="Ej: el Candy">'+
    '</div>';

    h+='<div class="cg-bloque"><div class="cg-bt" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><span>Productos ('+its.length+')</span>'+
      '<span style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="cg-btn" data-pt="pegar">📋 Cargar stock contado (pegar del Excel)</button><button type="button" class="cg-btn" data-pt="nuevo">+ Producto</button></span></div>';
    if(A.pegar){
      h+='<div class="pt-pegar"><div class="rem-gris">Copiá del Excel las columnas <b>producto</b> y <b>cantidad</b> (y precio si está) y pegalas acá. La cantidad pasa a ser lo que <b>hay hoy</b>.</div>'+
        '<textarea id="pt-texto" class="cg-in" rows="7" placeholder="Vaso Hulk&#9;12&#10;Pochoclera Spider-Man&#9;4">'+esc(A.texto)+'</textarea>'+
        '<div class="cg-acc"><button type="button" class="cg-btn" data-pt="revisar">Revisar</button><button type="button" class="cg-btn" data-pt="pegar-cerrar">Cancelar</button></div>';
      if(A.previa){
        if(!A.previa.length) h+='<div class="pt-error">No encontré renglones con nombre y cantidad.</div>';
        else h+='<div class="pt-previa">'+A.previa.map(function(x){
            return '<div><span>'+esc(x.f.nombre)+'</span><b>'+cant(x.f.cant)+' u.'+(x.f.precio?' · '+peso(x.f.precio):'')+'</b><i class="cg-tag '+(x.ex?'azul">actualiza '+esc(x.ex.nombre):'rojo">nuevo'+(x.cat?' (catálogo)':''))+'</i></div>';
          }).join('')+'</div>'+
          '<label class="pt-check"><input type="checkbox" id="pt-ocultar" '+(A.ocultarResto?'checked':'')+'> Ocultar los productos que no están en esta lista</label>'+
          '<button type="button" class="cg-btn verde" data-pt="cargar">Cargar '+A.previa.length+' productos</button>';
      }
      h+='</div>';
    }
    if(!its.length) h+='<div class="cg-vacio">No hay productos todavía.</div>';
    its.slice().sort(function(a,b){ return (a.oculto?1:0)-(b.oculto?1:0) || a.nombre.localeCompare(b.nombre); }).forEach(function(it){
      var x=r.por[it.id]||{vend:0,sinCob:0}, ab=A.abierto===it.id, qd=hayDe(it,r);
      h+='<div class="pt-item'+(ab?' abierto':'')+(it.oculto?' oculto':'')+'">'+
        '<div class="pt-row" data-pt="abrir" data-k="'+esc(it.id)+'">'+
          (it.foto?'<img src="'+esc(it.foto)+'" alt="">':'<span class="pt-ico">'+catDe(it.nombre).ico+'</span>')+
          '<div class="pt-n"><div>'+esc(it.nombre)+(it.oculto?' <i class="cg-tag">oculto</i>':'')+'</div><div class="rem-gris">'+(num(it.precio)?peso(num(it.precio)):'sin precio')+(num(it.sugerido)?' · venta '+peso(num(it.sugerido)):'')+'</div></div>'+
          '<div class="pt-nums"><b>'+cant(qd)+'</b><span>hay</span></div>'+
          '<div class="pt-nums">'+(x.sinCob>0?'<b style="color:#B91C1C">'+cant(x.sinCob)+'</b>':'<b>0</b>')+'<span>sin cobrar</span></div>'+
        '</div>';
      if(ab){
        h+='<div class="cg-edit"><div class="cg-grid">'+
          '<label>Nombre<input class="cg-in" data-pt-it="nombre" data-k="'+it.id+'" value="'+esc(it.nombre)+'"></label>'+
          '<label>Precio a Chulengo<input class="cg-in" inputmode="numeric" data-pt-it="precio" data-k="'+it.id+'" value="'+esc(it.precio||'')+'"></label>'+
          '<label>Venta al público<input class="cg-in" inputmode="numeric" data-pt-it="sugerido" data-k="'+it.id+'" value="'+esc(it.sugerido||'')+'"></label>'+
          '<label>Mínimo en el Candy<input class="cg-in" inputmode="numeric" data-pt-it="minimo" data-k="'+it.id+'" value="'+esc(it.minimo||'')+'" placeholder="ej: 10"></label>'+
          '<label>Corregir: hay hoy<input class="cg-in" inputmode="numeric" data-pt-it="contado" data-k="'+it.id+'" placeholder="'+cant(qd)+'"></label>'+
          '<label>Vendidas en total<input class="cg-in" disabled value="'+cant(x.vend)+'"></label>'+
        '</div>'+
        '<div class="cg-fotofila" style="margin-top:10px">'+(it.foto?'<img src="'+esc(it.foto)+'" alt="">':'<span class="cg-sinfoto">'+catDe(it.nombre).ico+'</span>')+
          '<button type="button" class="cg-btn" data-pt="foto-adm" data-k="'+it.id+'">📷 '+(it.foto?'Cambiar foto':'Poner foto')+'</button>'+
          (it.foto?'<button type="button" class="cg-btn rojo" data-pt="foto-quitar" data-k="'+it.id+'">Quitar foto</button>':'')+'</div>'+
        '<div class="cg-acc"><button type="button" class="cg-btn" data-pt="ocultar" data-k="'+it.id+'">'+(it.oculto?'👁 Mostrar':'🙈 Ocultar')+'</button>'+
          (!x.vend?'<button type="button" class="cg-btn rojo" data-pt="borrar" data-k="'+it.id+'">Borrar</button>':'')+'</div></div>';
      }
      h+='</div>';
    });
    return h+'</div></div>';
  }

  function refrescarAdm(){ if(V.pantalla==='ajustes' && $('pt-overlay')) pintar(); else renderHistorialRemitos(); }
  // ── Clicks ──
  document.addEventListener('click', function(e){
    var b=e.target.closest('[data-pt]'); if(!b) return;
    var acc=b.dataset.pt, k=b.dataset.k, it=k?items().find(function(x){ return x.id===k; }):null;

    if(acc==='login'){ loginGoogle(); return; }
    if(acc==='salir-cuenta' && V.comoRuben){ V.comoRuben=false; V.pantalla='tabla'; pintar(); return; }
    if(acc==='salir-cuenta'){ if(V.modo==='cliente' && !confirm('¿Cerrar sesión?')) return; firebase.auth().signOut(); return; }
    if(acc==='cerrar'){ cerrarOverlay(); return; }
    if(acc==='recargar'){ location.reload(); return; }
    if(acc==='excel'){ descargarExcel(); return; }
    if(acc==='como-ruben'){ if(V.modo!=='equipo') return; V.comoRuben=true; V.pantalla='tabla'; pintar(); $('pt-overlay').scrollTop=0; return; }
    if(acc==='como-yo'){ V.comoRuben=false; V.pantalla='tabla'; pintar(); $('pt-overlay').scrollTop=0; return; }
    if(acc==='a-tabla'){ irA('tabla'); return; }
    if(acc==='tab'){
      var pp=b.dataset.p; if(V.modo!=='equipo') return;
      if(pp==='altas') V.remAbierto=null;
      irA(pp);
      if(pp==='metricas' && window.ptMetricas) window.ptMetricas.entrar();
      if(pp==='produccion' && window.ptProduccion) window.ptProduccion.entrar();
      return;
    }
    if(acc==='a-ticket'){ if(V.modo!=='cliente' && !V.comoRuben) return; V.ticket={}; V.dia=diaHoy(); irA('ticket'); return; }
    if(acc==='a-altas'){ V.remAbierto=null; irA('altas'); return; }
    if(acc==='a-produccion'){ if(V.modo!=='equipo') return; irA('produccion'); if(window.ptProduccion) window.ptProduccion.entrar(); return; }
    if(acc==='a-metricas'){ if(V.modo!=='equipo') return; irA('metricas'); if(window.ptMetricas) window.ptMetricas.entrar(); return; }
    if(acc==='ver-movs'){ V.verMovs=true; pintar(); return; }
    if(acc==='ver-todos'){ V.verTodos=true; pintar(); return; }
    if(acc==='rem-abrir'){ V.remAbierto = V.remAbierto===b.dataset.id ? null : b.dataset.id; pintar(); return; }
    if(acc==='crear'){ b.disabled=true; b.textContent='Creando…'; crearTabla(V.cliente).catch(function(err){ alert('No se pudo crear: '+err.message); pintar(); }); return; }
    if(acc==='t-mas' || acc==='t-menos'){
      if(!it) return;
      var mx=hayDe(it,resumen()), nv=(V.ticket[k]||0)+(acc==='t-mas'?1:-1);
      V.ticket[k]=Math.max(0,Math.min(mx,nv)); pintar(); return;
    }
    if(acc==='guardar-ticket'){
      if(V.comoRuben){ alert('Esto es la vista previa de lo que ve Rubén: el ticket no se guarda. Los tickets los carga él.'); V.ticket={}; irA('tabla'); return; }
      var lineas=[], u=0, m=0;
      items().forEach(function(x){ var c=V.ticket[x.id]||0; if(c>0){ lineas.push({ k:x.id, nombre:x.nombre, cant:c, precio:num(x.precio) }); u+=c; m+=c*num(x.precio); } });
      if(!lineas.length){ alert('No cargaste ningún producto vendido.'); return; }
      var dia=(($('cs-dia')||{}).value)||diaHoy();
      if(!confirm('Ticket del '+diaTxt(dia)+':\n\n'+lineas.map(function(l){ return '• '+l.cant+' '+l.nombre; }).join('\n')+'\n\nTotal: '+u+' productos · '+peso(m)+'\n\n¿Guardar?')) return;
      b.disabled=true; b.textContent='Guardando…';
      db().collection('consig_portal').doc(P.pid).collection('ventas').add({ tipo:'ticket', dia:dia, lineas:lineas, email:emailAct(), fecha:FV().serverTimestamp(), cobrada:false, anulada:false })
        .then(function(){ V.ticket={}; avisoOk('✓ Ticket guardado: '+u+' productos descontados del stock.'); irA('tabla'); })
        .catch(function(err){ alert('No se pudo guardar. Revisá internet y probá de nuevo.\n('+err.message+')'); b.disabled=false; b.textContent='Guardar ticket'; });
      return;
    }
    if(acc==='anular'){
      var vt=P.ventas.find(function(x){ return x.id===b.dataset.id; }); if(!vt) return;
      var tt=totalTicket(vt);
      if(!confirm('¿Anular el ticket'+(vt.dia?' del '+diaTxt(vt.dia):'')+' ('+tt.u+' productos, '+peso(tt.m)+')?\nLos productos vuelven al stock.')) return;
      db().collection('consig_portal').doc(P.pid).collection('ventas').doc(vt.id).update({ anulada:true, anuladaEn:FV().serverTimestamp() })
        .catch(function(err){ alert('No se pudo anular: '+err.message); });
      return;
    }
    if(acc==='alta'){
      var rem=(remitosHistorialCache||[]).find(function(x){ return x.id===b.dataset.id; }); if(!rem) return;
      b.disabled=true; b.textContent='Guardando…';
      darDeAlta(rem).then(function(){ V.remAbierto=null; avisoOk('✓ Remito del '+(rem.fechaEntrega||'')+' sumado al stock del Candy.'); irA('tabla'); })
        .catch(function(err){ alert('No se pudo guardar: '+err.message); pintar(); });
      return;
    }
    if(acc==='cobrar'){
      var r=resumen(), pend=P.ventas.filter(function(v){ return !v.cobrada && !v.anulada; });
      if(!confirm('¿Te pagaron '+peso(r.tot.m)+' por '+cant(r.tot.u)+' productos?\n\nLos tickets quedan como pagados y el total vuelve a $ 0.')) return;
      var ref=db().collection('consig_portal').doc(P.pid).collection('ventas'), ps=[];
      for(var i=0;i<pend.length;i+=400){
        var bt=db().batch();
        pend.slice(i,i+400).forEach(function(v){ bt.update(ref.doc(v.id), { cobrada:true, cobradaEn:FV().serverTimestamp(), cobradaPor:emailAct() }); });
        ps.push(bt.commit());
      }
      Promise.all(ps).then(function(){ avisoOk('✓ Marcado como cobrado.'); pintar(); }).catch(function(err){ alert('No se pudo guardar: '+err.message); });
      return;
    }
    if(acc==='ajustes'){ irA('ajustes'); return; }

    // panel de ajustes
    if(acc==='abrir-tabla'){ window.abrirCandy(b.dataset.cliente||A.cliente||(P.doc&&P.doc.cliente)||undefined); return; }
    if(!b.closest('.pt-adm')) return;
    var cliente=A.cliente;
    if(acc==='crear-adm'){ crearTabla(cliente).catch(function(err){ alert(err.message); }); return; }
    if(acc==='copiar'){
      var hecho=function(){ b.textContent='✓ Copiado'; setTimeout(function(){ b.textContent='Copiar'; },1500); };
      if(navigator.clipboard) navigator.clipboard.writeText(URL_CLIENTE).then(hecho, function(){ prompt('Copiá el link:', URL_CLIENTE); });
      else prompt('Copiá el link:', URL_CLIENTE);
      return;
    }
    if(acc==='agregar-mail'){
      var mm=(($('pt-mail')||{}).value||'').trim().toLowerCase();
      if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mm)){ alert('Escribí un correo válido.'); return; }
      var b2=db().batch();
      b2.update(db().collection('consig_portal').doc(P.pid), { emails:FV().arrayUnion(mm) });
      b2.set(db().collection('consig_acceso').doc(mm), { pid:P.pid, cliente:cliente });
      b2.commit().catch(function(err){ alert('No se pudo agregar: '+err.message); });
      return;
    }
    if(acc==='quitar-mail'){
      var q=b.dataset.mail; if(!confirm('¿Sacarle el acceso a '+q+'?')) return;
      var b3=db().batch();
      b3.update(db().collection('consig_portal').doc(P.pid), { emails:FV().arrayRemove(q) });
      b3.delete(db().collection('consig_acceso').doc(q));
      b3.commit().catch(function(err){ alert('No se pudo quitar: '+err.message); });
      return;
    }
    if(acc==='pegar'){ A.pegar=!A.pegar; A.previa=null; refrescarAdm(); return; }
    if(acc==='pegar-cerrar'){ A.pegar=false; A.previa=null; A.texto=''; refrescarAdm(); return; }
    if(acc==='revisar'){ A.texto=(($('pt-texto')||{}).value)||''; A.previa=previaLista(); refrescarAdm(); return; }
    if(acc==='cargar'){
      var ocultar=!!(($('pt-ocultar')||{}).checked), lista=items(), tocados={};
      (A.previa||[]).forEach(function(x){
        var f=x.f, ex=x.ex || lista.find(function(y){ return norm(y.nombre)===norm((x.cat&&x.cat.nombre)||f.nombre); });
        if(ex){ ex.entregadas = f.cant + vendidasDe(ex.id); if(f.precio) ex.precio=f.precio; ex.oculto=false; tocados[ex.id]=1; }
        else {
          var c=x.cat||{}, nu={ id:nuevoId(), nombre:(c.nombre||f.nombre), precio:f.precio||num(c.precio), sugerido:num(c.sugerido), foto:c.foto||'', entregadas:f.cant, oculto:false };
          if(c.id) nu.catId=c.id;
          lista.push(nu); tocados[nu.id]=1;
        }
      });
      if(ocultar) lista.forEach(function(y){ if(!tocados[y.id]) y.oculto=true; });
      if(P.doc){ P.doc.items=lista; P.doc.desde=Date.now(); db().collection('consig_portal').doc(P.pid).update({desde:P.doc.desde}).catch(function(){}); }
      A.pegar=false; A.previa=null; A.texto='';
      guardarItems(); return;
    }
    if(acc==='nuevo'){
      var nom=(prompt('Nombre del producto:')||'').trim(); if(!nom) return;
      var c2=delCatalogo(cliente, nom)||{};
      var nu2={ id:nuevoId(), nombre:nom, precio:num(c2.precio), sugerido:num(c2.sugerido), foto:c2.foto||'', entregadas:0, oculto:false };
      items().push(nu2); A.abierto=nu2.id; guardarItems(); return;
    }
    if(acc==='abrir'){ A.abierto = A.abierto===k ? null : k; refrescarAdm(); return; }
    if(acc==='foto-adm'){ pedirFoto(k); return; }
    if(acc==='foto-quitar'){ if(it){ it.foto=''; guardarItems(); } return; }
    if(acc==='ocultar'){ if(it){ it.oculto=!it.oculto; guardarItems(); } return; }
    if(acc==='borrar'){ if(it && confirm('¿Borrar "'+it.nombre+'"?')){ var l=items(); l.splice(l.indexOf(it),1); A.abierto=null; guardarItems(); } return; }
  });

  document.addEventListener('change', function(e){
    var t=e.target;
    if(t.id==='pt-ocultar'){ A.ocultarResto=t.checked; return; }
    if(t.id==='cs-dia'){ V.dia=t.value; return; }
    if(t.classList && t.classList.contains('cs-num')){ pintar(); return; }
    if(!t.closest || !t.closest('.pt-adm')) return;
    if(t.dataset.ptCampo==='titulo'){ if(P.pid) db().collection('consig_portal').doc(P.pid).update({titulo:t.value.trim()}).catch(function(err){ alert(err.message); }); return; }
    var campo=t.dataset.ptIt; if(!campo) return;
    var it=items().find(function(x){ return x.id===t.dataset.k; }); if(!it) return;
    var val=t.value.trim();
    if(campo==='nombre'){ if(!val){ t.value=it.nombre; return; } it.nombre=val; }
    else if(campo==='precio' || campo==='sugerido'){ it[campo]= val==='' ? 0 : num(val); }
    else if(campo==='minimo'){ it.minimo = val==='' ? 0 : Math.max(0,Math.round(num(val))); }
    else if(campo==='contado'){ if(val==='') return; it.entregadas = num(val) + vendidasDe(it.id); }
    guardarItems();
  });
  document.addEventListener('input', function(e){
    var t=e.target;
    if(t.id==='cs-buscar'){
      V.filtro=t.value;
      if(V.pantalla==='ticket'){ var q=norm(V.filtro); document.querySelectorAll('.cs-tabla-ticket tbody tr').forEach(function(tr){ var n=tr.querySelector('b'); tr.style.display = !q || (n && norm(n.textContent).indexOf(q)!==-1) ? '' : 'none'; }); }
      else pintar();
      return;
    }
    if(t.classList && t.classList.contains('cs-num')){
      var mx=num(t.dataset.max), v=Math.max(0, Math.round(num(t.value)));
      if(v>mx){ v=mx; t.value=mx||''; }
      V.ticket[t.dataset.k]=v;
      var tr=t.closest('tr'); if(tr) tr.classList.toggle('marcado', v>0);
      var pie=$('cs-pie-txt'); if(pie) pie.innerHTML=textoPie();
      return;
    }
    if(t.id==='pt-texto'){ A.texto=t.value; }
  });
  document.addEventListener('focusout', function(e){
    if(A.pendiente && e.target.closest && e.target.closest('.pt-adm')){ A.pendiente=false; setTimeout(avisar, 50); }
  });

  // ── Entrar ──
  function clienteDelCandy(){
    var keys = typeof clientesInfoCache!=='undefined' ? Object.keys(clientesInfoCache) : [];
    try{ var g=localStorage.getItem('pt-cliente'); if(g) return Promise.resolve(g); }catch(_){}
    return db().collection('consig_portal').where('equipo','==','chulengo').get().then(function(s){
      var d=s.docs&&s.docs[0]; if(d && d.data().cliente) return d.data().cliente;
      return keys.find(function(k){ return /CINE/.test(k); }) || null;
    }).catch(function(){ return keys.find(function(k){ return /CINE/.test(k); }) || null; });
  }
  window.abrirCandy = function(cliente){
    if(!firebase.auth().currentUser){ if(typeof mostrarLoginModal==='function') mostrarLoginModal('default'); return; }
    // carga los remitos en segundo plano (hacen falta para dar de alta)
    if(typeof cargarHistorialRemitos==='function' && (typeof remitosHistorialCache==='undefined' || !remitosHistorialCache.length)){ try{ cargarHistorialRemitos(); cargarInfoClientesRemito(); }catch(_){} }
    var intentos=0;
    (function ir(){
      (typeof cliente==='string' && cliente ? Promise.resolve(cliente) : clienteDelCandy()).then(function(cli){
        if(!cli){
          if(++intentos<8) return setTimeout(ir, 500);
          alert('No encontré el cliente del cine. Entrá a Remitos → ficha del cine → 📦 Stock y catálogo → 🍿 Stock compartido.'); return;
        }
        try{ localStorage.setItem('pt-cliente', cli); }catch(_){}
        V.cliente=cli; suscribir(slug(cli)); abrirOverlay('equipo');
        history.replaceState(null,'','#candy');
      });
    })();
  };

  function alCambiarUsuario(u){
    var quiere = /^#candy/i.test(location.hash||'');
    if(!u){
      if(V.modo==='cliente' || V.modo==='sinAcceso' || quiere){ desuscribir(); abrirOverlay('login'); }
      return;
    }
    var em=(u.email||'').toLowerCase();
    setTimeout(function(){
      if(!esEquipo() || P.pid) return;
      try{ var g=localStorage.getItem('pt-cliente'); if(g) suscribir(slug(g)); }catch(_){}
    }, 1200);
    db().collection('consig_acceso').doc(em).get().then(function(s){
      if(s.exists && s.data().pid && !esAdm()){ suscribir(s.data().pid); abrirOverlay('cliente'); }
      else if(quiere && esEquipo()){ setTimeout(function(){ window.abrirCandy(); }, 300); }
      else if(quiere) abrirOverlay('sinAcceso');
      else if(V.modo==='login') cerrarOverlay();
    }).catch(function(){
      if(quiere && esEquipo()) setTimeout(function(){ window.abrirCandy(); }, 300);
      else if(quiere) abrirOverlay('sinAcceso'); else if(V.modo==='login') cerrarOverlay();
    });
  }

  // ── Enganches ──
  function enganchar(){
    if(window._ptListo || typeof renderHistorialRemitos!=='function') return;
    window._ptListo=true;
    var orig=renderHistorialRemitos;
    window.renderHistorialRemitos=function(animar){
      if(typeof remNav!=='undefined' && remNav.tipo==='portal'){
        var cont=$('remito-historial-clientes'); if(!cont) return;
        var tb=document.querySelector('#remito-historial-wrap .rem-toolbar'); if(tb) tb.style.display='none';
        cont.innerHTML='<div class="rem-vista'+(animar?' entra':'')+'">'+renderAdmin(remNav.cliente)+'</div>';
        return;
      }
      return orig.apply(this, arguments);
    };
    // En la ficha de un remito del cine: botón para darlo de alta en el Candy
    if(typeof renderFichaRemito==='function'){
      var fichaOrig=renderFichaRemito;
      window.renderFichaRemito=function(rem){
        var h=fichaOrig.apply(this, arguments);
        if(!P.doc || String(P.doc.cliente||'').trim().toUpperCase()!==String(rem.cliente||'').trim().toUpperCase()) return h;
        var hecho=altas().find(function(a){ return a.remId===rem.id; });
        var bloque='<div class="rem-bloque pt-remcandy"><div><div class="rem-bloque-t" style="margin:0">🍿 Stock del Candy</div><div class="rem-gris">'+
          (hecho?'Ya está sumado al stock ('+new Date(hecho.fecha).toLocaleDateString('es-AR')+').':'Este remito todavía no se sumó al stock compartido.')+'</div></div>'+
          (hecho?'<button type="button" class="cg-btn" data-pt="abrir-tabla">Ver tabla</button>':'<button type="button" class="cg-btn verde" data-pt-alta="'+esc(rem.id)+'">Dar de alta en el Candy</button>')+'</div>';
        var i=h.indexOf('<div class="rem-bloque"><div class="rem-bloque-t">Productos');
        return i===-1 ? h+bloque : h.slice(0,i)+bloque+h.slice(i);
      };
      document.addEventListener('click', function(e){
        var b=e.target.closest('[data-pt-alta]'); if(!b) return;
        var rem=(remitosHistorialCache||[]).find(function(x){ return x.id===b.dataset.ptAlta; }); if(!rem) return;
        var pv=previaRemito(rem);
        if(!confirm('Se suman al stock del Candy:\n\n'+pv.map(function(x){ return '• '+x.cant+' '+x.nombre+(x.it?'':' (nuevo)'); }).join('\n')+'\n\n¿Seguimos?')) return;
        b.disabled=true; b.textContent='Guardando…';
        darDeAlta(rem).catch(function(err){ alert('No se pudo guardar: '+err.message); renderHistorialRemitos(); });
      });
    }
    try{ firebase.auth().onAuthStateChanged(alCambiarUsuario); }catch(_){}
    if(/^#candy/i.test(location.hash||'')) setTimeout(function(){ if(!firebase.auth().currentUser && !V.modo) abrirOverlay('login'); }, 1500);

    var st=document.createElement('style');
    st.textContent=
      'body.pt-abierto{overflow:hidden}'+
      '.cs{position:fixed;inset:0;z-index:99999;overflow-y:auto;-webkit-overflow-scrolling:touch;background:#F4F2EE;color:#1A1814;font:15px/1.45 Inter,system-ui,sans-serif}'+
      '.cs *{box-sizing:border-box}.cs button{font-family:inherit}'+
      '.cs-top{background:#1A1814;color:#fff;position:sticky;top:0;z-index:10}'+
      '.cs-top-in{max-width:1040px;margin:0 auto;padding:10px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px}'+
      '.cs-marca{display:flex;align-items:center;gap:10px;min-width:0}.cs-marca img{width:34px;height:34px;border-radius:8px}.cs-marca b{display:block;font-size:0.95rem}.cs-marca span{display:block;font-size:0.78rem;color:#B9B3A9}'+
      '.cs-top-r{display:flex;align-items:center;gap:10px}.cs-user{font-size:0.78rem;color:#B9B3A9;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
      '.cs-top .cs-btn.ghost{background:transparent;color:#fff;border-color:#4A453E}'+
      '.cs-tabs{background:#fff;border-bottom:1px solid #E2DDD6}.cs-tabs-in{max-width:1040px;margin:0 auto;padding:0 12px;display:flex;gap:2px;overflow-x:auto;scrollbar-width:none}.cs-tabs-in::-webkit-scrollbar{display:none}'+
      '.cs-tabs button{flex-shrink:0;display:flex;align-items:center;gap:7px;border:none;background:none;padding:13px 14px 11px;font:inherit;font-size:0.88rem;font-weight:600;color:#6B665E;cursor:pointer;border-bottom:3px solid transparent}'+
      '.cs-tabs button i{font-style:normal}.cs-tabs button:hover{color:#1A1814}.cs-tabs button.on{color:#1A1814;border-bottom-color:#2D6A4F}'+
      '.con-tabs .cs-titulo [data-pt=a-tabla]{display:none}.cs-adm .rem-ficha-top,.cs-adm .cg-tit{display:none!important}'+
      '.cs-adm .cg-bloque{background:#fff;border:1px solid #E2DDD6;border-radius:12px;padding:16px;margin-bottom:16px;box-shadow:none}.cs-adm .cg-bt{font-size:0.95rem;font-weight:700;margin-bottom:10px}'+
      '.cs-tabs button em{font-style:normal;font-size:0.66rem;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;background:#E7F3EC;color:#2D6A4F;padding:2px 6px;border-radius:99px}'+
      '.cs-tabs .cs-tab-ruben{margin-left:auto;color:#2D6A4F}.cs-tabs .cs-tab-ruben:hover{color:#1B4332}'+
      '.cs-preview{position:sticky;top:0;z-index:30;display:flex;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap;background:#FEF3C7;border-bottom:2px solid #F59E0B;color:#78350F;padding:10px 16px;font-size:0.92rem;text-align:center}'+
      '.cs-sub{margin:3px 0 0;color:#6B665E;font-size:0.9rem}.cs-titulo{align-items:flex-start}.cs-titulo .cs-btn{margin-top:2px}'+
      '.cs-aviso{background:#FFFBEB;border:1px solid #FDE68A;color:#78350F;border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:0.9rem}'+
      '.cs-seg{display:flex;gap:4px;background:#EAE6DF;padding:4px;border-radius:10px;margin-bottom:18px;overflow-x:auto;scrollbar-width:none}.cs-seg::-webkit-scrollbar{display:none}'+
      '.cs-seg button{flex:1 0 auto;border:none;background:none;padding:9px 14px;border-radius:7px;font:inherit;font-size:0.86rem;font-weight:600;color:#6B665E;cursor:pointer;white-space:nowrap;display:flex;align-items:center;justify-content:center;gap:6px}'+
      '.cs-seg button.on{background:#fff;color:#1A1814;box-shadow:0 1px 3px rgba(0,0,0,0.08)}'+
      '.cs-in{max-width:1040px;margin:0 auto;padding:26px 20px 110px}'+
      '.cs-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:9px 14px;border-radius:8px;border:1px solid #D9D3C9;background:#fff;color:#1A1814;font-size:0.88rem;font-weight:600;cursor:pointer;white-space:nowrap}'+
      '.cs-btn:hover{background:#FAF8F5}.cs-btn.primario{background:#2D6A4F;border-color:#2D6A4F;color:#fff}.cs-btn.primario:hover{background:#245a42}'+
      '.cs-btn.ghost{background:transparent}.cs-btn.grande{width:100%;padding:14px;font-size:1rem}.cs-btn:disabled{opacity:0.6;cursor:default}'+
      '.cs-badge{font-style:normal;background:#B91C1C;color:#fff;border-radius:999px;padding:0 7px;font-size:0.72rem;line-height:1.5}'+
      '.cs-card{background:#fff;border:1px solid #E2DDD6;border-radius:12px;margin-bottom:16px;overflow:hidden}'+
      '.cs-card-h{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 18px;border-bottom:1px solid #EEEAE4;flex-wrap:wrap}.cs-card-h h3{margin:0;font-size:1rem}'+
      '.cs-input{padding:8px 11px;border:1px solid #D9D3C9;border-radius:8px;font:inherit;font-size:0.88rem;background:#fff;color:#1A1814;min-width:0}'+
      '.cs-card-h .cs-input{width:240px}'+
      '.cs-msg{max-width:460px;margin:30px auto;padding:26px 24px}.cs-msg h2{margin:0 0 10px;font-size:1.2rem}.cs-msg p{margin:0 0 16px;color:#3F3A33}'+
      '.cs-gris{color:#8A8479}.cs-ok{background:#ECFDF5;border:1px solid #A7F3D0;color:#14532D;border-radius:10px;padding:10px 14px;margin-bottom:14px;font-weight:600}'+
      '.cs-kpis{display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:12px;margin-bottom:16px}'+
      '.cs-kpi{background:#fff;border:1px solid #E2DDD6;border-radius:12px;padding:14px 16px}.cs-kpi span{display:block;font-size:0.72rem;font-weight:700;color:#8A8479;text-transform:uppercase;letter-spacing:0.04em}'+
      '.cs-kpi b{display:block;font-size:1.55rem;font-weight:800;margin:2px 0}.cs-kpi b.chico{font-size:1.1rem;padding:6px 0}.cs-kpi small{color:#8A8479;font-size:0.8rem}'+
      '.cs-kpi.destacado{background:#1A1814;border-color:#1A1814;color:#fff}.cs-kpi.destacado span,.cs-kpi.destacado small{color:#B9B3A9}'+
      '.cs-acciones{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}'+
      '.cs-tabla{width:100%;border-collapse:collapse}.cs-tabla th{text-align:left;font-size:0.72rem;font-weight:700;color:#8A8479;text-transform:uppercase;letter-spacing:0.04em;padding:10px 16px;background:#FAF8F5;border-bottom:1px solid #EEEAE4}'+
      '.cs-tabla td{padding:10px 16px;border-bottom:1px solid #F0ECE6;vertical-align:middle}.cs-tabla tr:last-child td{border-bottom:none}.cs-tabla .n{text-align:right;white-space:nowrap}'+
      '.cs-tabla td.hay{font-size:1.05rem;font-weight:800}.cs-tabla small{color:#8A8479;font-size:0.78rem}.cs-tabla small.blq{display:block}.cs-tabla tr.agotado td{color:#A09890}.cs-tabla tr.agotado img,.cs-tabla tr.agotado .cs-ico{opacity:0.5}'+
      '.cs-tabla tr.marcado td{background:#F0FDF7}.cs-sm{display:none}'+
      '.cs-prod{display:flex;align-items:center;gap:12px;min-width:0}.cs-prod img,.cs-ico{width:44px;height:44px;border-radius:8px;object-fit:cover;flex-shrink:0;background:#F5F2ED;display:flex;align-items:center;justify-content:center;font-size:1.35rem}'+
      '.cs-prod b{display:block;font-weight:600}.cs-prod small{display:block}'+
      '.cs-cero{color:#B91C1C;font-size:0.8rem;font-weight:700}.cs-vacio{padding:22px 16px;text-align:center;color:#8A8479}'+
      '.cs-movs{padding:4px 16px 12px}.cs-mov{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #F0ECE6}.cs-mov:last-child{border-bottom:none}.cs-mov.anulado{opacity:0.55}'+
      '.cs-mov-t{flex:1;min-width:0}.cs-mov-t b{display:block;font-size:0.9rem}.cs-mov-t small{display:block;color:#8A8479;font-size:0.8rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
      '.cs-mov-r{text-align:right;flex-shrink:0}.cs-mov-r b{display:block;font-size:0.88rem}.cs-mov-r small{color:#8A8479;font-size:0.78rem}'+
      '.cs-tag{font-size:0.7rem;font-weight:700;border-radius:999px;padding:2px 9px;white-space:nowrap;flex-shrink:0}.cs-tag.azul{background:#DBEAFE;color:#1D4ED8}.cs-tag.rojo{background:#FEE2E2;color:#B91C1C}.cs-tag.verde{background:#DCFCE7;color:#166534}.cs-tag.gris{background:#EEEAE4;color:#6B665E}'+
      '.cs-link{border:none;background:none;color:#B91C1C;font-weight:600;cursor:pointer;padding:0;font-size:inherit;text-decoration:underline}'+
      '.cs-titulo{display:flex;gap:12px;margin-bottom:18px}.cs-titulo h2{margin:0;font-size:1.35rem;letter-spacing:-0.01em}'+
      '.cs-ticket-cab{padding:14px 16px;border-bottom:1px solid #EEEAE4;display:flex;flex-direction:column;gap:10px}.cs-ticket-cab label{display:flex;align-items:center;gap:10px;font-weight:600;font-size:0.88rem}.cs-ticket-cab p{margin:0;font-size:0.88rem}'+
      '.cs-step{display:inline-flex;align-items:center;border:1px solid #D9D3C9;border-radius:8px;overflow:hidden;background:#fff}'+
      '.cs-step button{width:38px;height:40px;border:none;background:#FAF8F5;font-size:1.15rem;font-weight:700;cursor:pointer;color:#1A1814}.cs-step button:disabled{color:#C9C4BC;cursor:default}'+
      '.cs-step input{width:52px;height:40px;border:none;border-left:1px solid #E2DDD6;border-right:1px solid #E2DDD6;text-align:center;font:inherit;font-weight:700;font-size:1rem;color:#1A1814;background:#fff}'+
      '.cs-pie{position:fixed;left:0;right:0;bottom:0;background:#fff;border-top:1px solid #E2DDD6;box-shadow:0 -4px 16px rgba(0,0,0,0.06);z-index:11}'+
      '.cs-pie-in{max-width:1040px;margin:0 auto;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px}.cs-pie-in b{display:block}.cs-pie-in span{font-size:0.85rem;color:#6B665E}.cs-pie .cs-btn{padding:12px 22px;font-size:0.95rem}'+
      '.cs-rem-h{display:flex;width:100%;justify-content:space-between;align-items:center;gap:10px;padding:14px 16px;border:none;background:none;text-align:left;cursor:pointer;color:#1A1814}.cs-rem-h b{display:block}.cs-rem-h small{color:#8A8479}'+
      '.cs-rem.abierto .cs-rem-h{border-bottom:1px solid #EEEAE4}.cs-rem-acc{padding:12px 16px;display:flex;justify-content:flex-end;border-top:1px solid #EEEAE4}'+
      '@media(max-width:680px){'+
        '.cs-in{padding:14px 12px 110px}.cs-top-in{padding:10px 12px}.cs-user{display:none}'+
        '.cs-kpis{grid-template-columns:1fr 1fr}.cs-kpi.destacado{grid-column:1 / -1}.cs-kpi b{font-size:1.3rem}'+
        '.cs-card-h{flex-wrap:wrap}.cs-card-h .cs-input{width:100%}'+
        '.cs-tabla th,.cs-tabla td{padding:9px 10px}.cs-tabla-stock th:nth-child(2),.cs-tabla-stock td[data-l="Precio"]{display:none}.cs-lg{display:none}.cs-sm{display:inline!important}.cs-tabla-ticket .cs-prod img,.cs-tabla-ticket .cs-ico{display:none}'+
        '.cs-prod img,.cs-ico{width:38px;height:38px}.cs-prod{gap:9px}.cs-tabla td small{font-size:0.72rem}'+
        '.cs-acciones .cs-btn{flex:1 1 auto}.cs-step button{width:34px}.cs-step input{width:44px}'+
      '}'+
      '.pt-remcandy{display:flex;align-items:center;justify-content:space-between;gap:10px;border-color:#A7F3D0!important;background:#F0FDF7!important;flex-wrap:wrap}'+
      '.pt-acceso{display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;border-color:#A7F3D0!important;background:#F0FDF7!important}'+
      '.pt-error{background:#FEF2F2;color:#991B1B;border-color:#FECACA!important;padding:10px 12px;border-radius:10px;font-size:0.88rem}'+
      '.pt-item{border-bottom:1px solid #F0ECE6}.pt-item.abierto{background:#FAF8F5}.pt-item.oculto .pt-row{opacity:0.5}'+
      '.pt-row{display:flex;align-items:center;gap:10px;padding:8px 4px;cursor:pointer}'+
      '.pt-row img,.pt-ico{width:44px;height:44px;border-radius:9px;object-fit:cover;flex-shrink:0;background:#F5F2ED;display:flex;align-items:center;justify-content:center;font-size:1.4rem}'+
      '.pt-n{flex:1;min-width:0;font-weight:600;font-size:0.88rem}.pt-n .rem-gris{font-weight:400;font-size:0.76rem}'+
      '.pt-nums{text-align:center;min-width:58px}.pt-nums b{display:block;font-size:1rem}.pt-nums span{font-size:0.62rem;color:#8A8479;text-transform:uppercase;font-weight:700}'+
      '.pt-pegar{background:#F5F9FF;border:1px solid #BFDBFE;border-radius:10px;padding:10px;margin-bottom:10px;display:flex;flex-direction:column;gap:8px}.pt-pegar textarea{font-family:ui-monospace,monospace;font-size:0.8rem}'+
      '.pt-previa{max-height:260px;overflow:auto;background:#fff;border:1px solid #E2DDD6;border-radius:8px}.pt-previa div{display:flex;gap:8px;align-items:center;padding:6px 8px;border-bottom:1px solid #F0ECE6;font-size:0.82rem}.pt-previa span{flex:1;min-width:0}'+
      '.pt-check{display:flex;gap:6px;align-items:center;font-size:0.82rem}';
    document.head.appendChild(st);
  }
  window.ptCore = { P:P, V:V, items:items, altas:altas, resumen:resumen, hayDe:hayDe, lineasDe:lineasDe, aFecha:aFecha, pintar:pintar, guardarItems:guardarItems,
    db:db, FV:FV, esc:esc, irA:irA, delCatalogo:delCatalogo, peso:peso, num:num, cant:cant, norm:norm, nuevoId:nuevoId, catDe:catDe, pad:pad, diaTxt:diaTxt, emailAct:emailAct };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', enganchar); else enganchar();
})();
