// ═══ Stock en consignación (catálogo por cliente) ═══
// Para clientes que te pagan a medida que venden (el cine, el cotillón):
// un catálogo fijo de productos con costo, precio y mínimo, y un panel que
// suma los remitos para mostrar qué llevaste, qué te pagaron, qué queda y qué reponer.
// El catálogo se guarda en la ficha del cliente (clientes_remito_info → campo "catalogo").
(function(){
  function $(id){ return document.getElementById(id); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function peso(n){ return typeof formatearMoneda==='function' ? formatearMoneda(n||0) : '$ '+Math.round(n||0); }
  function num(v){ if(typeof v==='number') return v; var n=parseFloat(String(v==null?'':v).replace(/\$/g,'').replace(/\s/g,'').replace(/\./g,'').replace(',','.')); return isNaN(n)?0:n; }
  function cant(n){ return (Math.round(n*100)/100).toLocaleString('es-AR'); }
  function norm(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim(); }
  function nuevoId(){ return 'p'+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
  function hoyTxt(){ var d=new Date(); return ('0'+d.getDate()).slice(-2)+'/'+('0'+(d.getMonth()+1)).slice(-2)+'/'+d.getFullYear(); }
  function msDeTxt(t){ var p=String(t||'').split('/'); return p.length===3 ? new Date(+p[2],+p[1]-1,+p[0]).getTime() : 0; }

  // ── Datos ──
  function catalogo(cliente){
    var info = (typeof clientesInfoCache!=='undefined' && clientesInfoCache[cliente]) || {};
    if(!Array.isArray(info.catalogo)) info.catalogo = [];
    if(typeof clientesInfoCache!=='undefined' && !clientesInfoCache[cliente]) clientesInfoCache[cliente] = info;
    return info.catalogo;
  }
  var tGuardar = {};
  function guardar(cliente){
    clearTimeout(tGuardar[cliente]);
    tGuardar[cliente] = setTimeout(function(){
      var cat = JSON.parse(JSON.stringify(catalogo(cliente)));
      var info = clientesInfoCache[cliente];
      if(info && info.id){
        firebase.firestore().collection('clientes_remito_info').doc(info.id).update({catalogo: cat})
          .catch(function(e){ alert('No se pudo guardar el catálogo: '+e.message); });
      } else if(typeof guardarInfoCliente==='function'){
        guardarInfoCliente(cliente, 'catalogo', cat);
        clientesInfoCache[cliente].catalogo = cat;
      }
    }, 500);
  }
  function aliasDe(p){ var a=(p.alias||[]).slice(); var n=norm(p.nombre); if(n && a.indexOf(n)===-1) a.push(n); return a; }
  function productoDeNombre(cat, nombre){ var n=norm(nombre); if(!n) return null; return cat.find(function(p){ return aliasDe(p).indexOf(n)!==-1; }) || null; }

  function renglonesCliente(cliente){
    var out=[];
    (typeof remitosHistorialCache!=='undefined'?remitosHistorialCache:[]).forEach(function(rem){
      if((rem.cliente||'').trim().toUpperCase()!==cliente) return;
      var ms = typeof fechaRemitoMs==='function' ? fechaRemitoMs(rem) : 0;
      (rem.renglones||[]).forEach(function(r, idx){
        if(!String(r.producto||'').trim()) return;
        var pg = calcularPagoRenglon(r);
        out.push({ rem:rem, idx:idx, r:r, n:norm(r.producto), nombre:String(r.producto).trim(), ms:ms, fecha:rem.fechaEntrega||'',
          cant:pg.cantTotal, pagadas:pg.cantPagada, pendiente:pg.montoPendiente, unit:(r.subtotal||0)/(pg.cantTotal||1) });
      });
    });
    return out;
  }

  function calcular(cliente){
    var cat = catalogo(cliente), filas = renglonesCliente(cliente);
    var porProd = {}, sueltos = {};
    cat.forEach(function(p){ porProd[p.id] = { p:p, ent:0, pag:0, monto:0, ultMs:0, ultPrecio:0, entDesdeConteo:0, renglones:[] }; });
    filas.forEach(function(f){
      var p = productoDeNombre(cat, f.nombre);
      if(p){
        var x=porProd[p.id]; x.ent+=f.cant; x.pag+=f.pagadas; x.monto+=f.pendiente; x.renglones.push(f);
        if(f.ms>=x.ultMs){ x.ultMs=f.ms; x.ultPrecio=f.unit; }
        if(p.contado && f.ms > msDeTxt(p.contado.fecha)) x.entDesdeConteo += f.cant;
      } else {
        var s = sueltos[f.n] || (sueltos[f.n] = { n:f.n, nombre:f.nombre, ent:0, pag:0, unit:f.unit, ultMs:0 });
        s.ent+=f.cant; s.pag+=f.pagadas; if(f.ms>=s.ultMs){ s.ultMs=f.ms; s.unit=f.unit; s.nombre=f.nombre; }
      }
    });
    var lista = cat.map(function(p){
      var x = porProd[p.id];
      x.sinCobrar = Math.max(0, x.ent - x.pag);
      x.precio = num(p.precio) || x.ultPrecio;
      if(p.contado && p.contado.n!=='' && p.contado.n!=null){
        x.enCliente = num(p.contado.n) + x.entDesdeConteo;
        x.vendidoSinCobrar = Math.max(0, x.sinCobrar - x.enCliente);
      } else { x.enCliente = null; x.vendidoSinCobrar = null; }
      var stock = x.enCliente!=null ? x.enCliente : x.sinCobrar;
      x.producir = num(p.minimo) > stock ? Math.ceil(num(p.minimo) - stock) : 0;
      x.margen = (num(p.precio)||x.ultPrecio) - num(p.costo);
      return x;
    });
    var sueltosL = Object.keys(sueltos).map(function(k){ return sueltos[k]; }).sort(function(a,b){ return (b.ent-b.pag)-(a.ent-a.pag) || a.nombre.localeCompare(b.nombre); });
    return { lista:lista, sueltos:sueltosL };
  }

  // Resumen para la ficha del cliente
  window.consigResumen = function(cliente){
    var c = calcular(cliente), u=0, m=0, prod=0;
    c.lista.forEach(function(x){ u+=x.sinCobrar; m+=x.monto; prod+=x.producir; });
    return { productos:c.lista.length, unidades:u, monto:m, producir:prod, sueltos:c.sueltos.length };
  };

  // ── Vista ──
  var estado = { abierto:null, filtro:'' };
  window.consigAbrir = function(cliente){ estado.abierto=null; remIr({tipo:'consig', cliente:cliente}); };

  function campo(pid, k, val, ph, tipo){
    return '<input class="cg-in" data-cg-campo="'+k+'" data-pid="'+pid+'" '+(tipo==='num'?'inputmode="numeric" ':'')+'value="'+esc(val==null?'':val)+'" placeholder="'+esc(ph||'')+'">';
  }

  function render(cliente){
    var c = calcular(cliente), cat = catalogo(cliente);
    var tot = { u:0, m:0, prod:0, vend:0 };
    c.lista.forEach(function(x){ tot.u+=x.sinCobrar; tot.m+=x.monto; tot.prod+=x.producir; if(x.vendidoSinCobrar) tot.vend+=x.vendidoSinCobrar*x.precio; });
    var h = '<div class="cg">'+
      '<div class="rem-ficha-top"><button type="button" class="rem-back">← Volver</button></div>'+
      '<div class="cg-tit" style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap"><div><div class="cg-h1">Stock en '+esc(cliente)+'</div><div class="rem-gris">Lo que llevaste, lo que te pagaron, lo que queda allá y lo que tenés que reponer.</div></div>'+
        '<button type="button" class="cg-btn" data-cg="ver-rub">👀 Ver como el cliente (prueba)</button></div>'+
      '<div class="cg-bloque pt-acceso" data-pt="abrir-adm" data-cliente="'+esc(cliente)+'"><div><div class="cg-bt" style="margin:0">📱 Página en vivo para el cliente</div><div class="rem-gris">Lo que el cliente marca como vendido, los productos que ve, quién entra y cobrar.</div></div><span class="rem-flecha">›</span></div>'+
      '<div class="cg-kpis">'+
        '<div class="cg-kpi"><span>Sin cobrar</span><b>'+cant(tot.u)+' u.</b></div>'+
        '<div class="cg-kpi"><span>Plata sin cobrar</span><b style="color:#B45309">'+peso(tot.m)+'</b></div>'+
        (tot.vend>0.5?'<div class="cg-kpi"><span>Vendido, te deben</span><b style="color:#B91C1C">'+peso(tot.vend)+'</b></div>':'')+
        '<div class="cg-kpi"><span>A producir</span><b style="color:'+(tot.prod?'#1D4ED8':'#2D6A4F')+'">'+(tot.prod?cant(tot.prod)+' u.':'Nada')+'</b></div>'+
      '</div>';

    // A producir
    var prodL = c.lista.filter(function(x){ return x.producir>0; });
    if(prodL.length){
      h += '<div class="cg-bloque cg-producir"><div class="cg-bt">🛠 Para reponer</div>'+
        prodL.map(function(x){ return '<div class="cg-prod-row"><span>'+esc(x.p.nombre)+'</span><b>'+cant(x.producir)+' u.</b></div>'; }).join('')+'</div>';
    }

    // Catálogo
    h += '<div class="cg-bloque"><div class="cg-bt" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><span>Productos ('+cat.length+')</span>'+
      '<span style="display:flex;gap:6px"><input id="cg-buscar" class="cg-in" style="width:170px" placeholder="Buscar..." value="'+esc(estado.filtro)+'"><button type="button" class="cg-btn" data-cg="nuevo">+ Producto</button></span></div>';
    if(!cat.length){
      h += '<div class="cg-vacio">Todavía no armaste el catálogo de este cliente. Abajo están los nombres que usaste en los remitos: creá un producto con cada uno, o vinculá varios nombres al mismo producto.</div>';
    } else {
      h += '<div class="cg-tabla"><div class="cg-fila cg-cab"><span>Producto</span><span>Precio</span><span>Costo</span><span>Te queda</span><span>Llevaste</span><span>Cobrado</span><span>Sin cobrar</span><span>Mínimo</span><span></span></div>';
      var q = norm(estado.filtro);
      c.lista.slice().sort(function(a,b){ return b.sinCobrar-a.sinCobrar || a.p.nombre.localeCompare(b.p.nombre); }).forEach(function(x){
        var p=x.p; if(q && norm(p.nombre).indexOf(q)===-1) return;
        var abierto = estado.abierto===p.id;
        h += '<div class="cg-item'+(abierto?' abierto':'')+'">'+
          '<div class="cg-fila" data-cg="abrir" data-pid="'+p.id+'">'+
            '<span class="cg-nom">'+esc(p.nombre)+(x.producir?' <i class="cg-tag azul">reponer '+cant(x.producir)+'</i>':'')+(x.vendidoSinCobrar?' <i class="cg-tag rojo">te deben '+cant(x.vendidoSinCobrar)+'</i>':'')+'</span>'+
            '<span data-l="Precio">'+(x.precio?peso(x.precio):'—')+'</span>'+
            '<span data-l="Costo">'+(num(p.costo)?peso(p.costo):'—')+'</span>'+
            '<span data-l="Te queda" class="'+(num(p.costo)&&x.margen<0?'cg-neg':'')+'">'+(num(p.costo)?peso(x.margen):'—')+'</span>'+
            '<span data-l="Llevaste">'+cant(x.ent)+'</span>'+
            '<span data-l="Cobrado">'+cant(x.pag)+'</span>'+
            '<span data-l="Sin cobrar"><b>'+cant(x.sinCobrar)+'</b>'+(x.enCliente!=null?'<br><small class="rem-gris">'+cant(x.enCliente)+' en el lugar</small>':'')+'</span>'+
            '<span data-l="Mínimo">'+(num(p.minimo)||'—')+'</span>'+
            '<span class="cg-chev">'+(abierto?'▴':'▾')+'</span>'+
          '</div>';
        if(abierto){
          h += '<div class="cg-edit">'+
            '<div class="cg-grid">'+
              '<label>Nombre'+campo(p.id,'nombre',p.nombre,'')+'</label>'+
              '<label>Precio para el cliente'+campo(p.id,'precio',p.precio,x.ultPrecio?String(Math.round(x.ultPrecio)):'','num')+'</label>'+
              '<label>Tu costo'+campo(p.id,'costo',p.costo,'','num')+'</label>'+
              '<label>Venta sugerida'+campo(p.id,'sugerido',p.sugerido,'','num')+'</label>'+
              '<label>Mínimo en el lugar'+campo(p.id,'minimo',p.minimo,'Ej: 10','num')+'</label>'+
              '<label>Contado en el lugar'+campo(p.id,'contado',p.contado?p.contado.n:'', 'Cuántos hay hoy','num')+(p.contado?'<small class="rem-gris">contado el '+esc(p.contado.fecha)+'</small>':'')+'</label>'+
            '</div>'+
            '<div class="cg-sub">Foto (la ve el cliente)</div><div class="cg-fotofila">'+
              (p.foto?'<img src="'+esc(p.foto)+'" alt="">':'<span class="cg-sinfoto">'+catDe(p.nombre).ico+'</span>')+
              '<button type="button" class="cg-btn" data-cg="foto" data-pid="'+p.id+'">📷 '+(p.foto?'Cambiar foto':'Poner foto')+'</button>'+
              (p.foto?'<button type="button" class="cg-btn rojo" data-cg="foto-quitar" data-pid="'+p.id+'">Quitar</button>':'')+
            '</div>'+
            '<div class="cg-sub">Nombres de remito vinculados</div><div class="cg-chips">'+
              aliasDe(p).map(function(a){ return '<span class="cg-chip">'+esc(a)+(a!==norm(p.nombre)?' <button type="button" data-cg="desvincular" data-pid="'+p.id+'" data-alias="'+esc(a)+'">×</button>':'')+'</span>'; }).join('')+
            '</div>'+
            (x.renglones.length?'<div class="cg-sub">Entregas</div><div class="cg-entregas">'+x.renglones.slice().sort(function(a,b){return b.ms-a.ms;}).map(function(f){
              return '<div><span>'+esc(f.fecha)+' · '+esc(f.nombre)+'</span><span>'+cant(f.cant)+' u. · cobradas '+cant(f.pagadas)+'</span></div>'; }).join('')+'</div>':'')+
            '<div class="cg-acc">'+
              (x.sinCobrar>0?'<button type="button" class="cg-btn verde" data-cg="cobrar" data-pid="'+p.id+'">Marcar todo como cobrado</button>':'')+
              (cat.length>1?'<select class="cg-in" data-cg-unir="'+p.id+'" style="width:auto"><option value="">Unir con otro producto…</option>'+cat.filter(function(o){return o.id!==p.id;}).map(function(o){ return '<option value="'+o.id+'">'+esc(o.nombre)+'</option>'; }).join('')+'</select>':'')+
              '<button type="button" class="cg-btn rojo" data-cg="borrar" data-pid="'+p.id+'">Borrar producto</button>'+
            '</div></div>';
        }
        h += '</div>';
      });
      h += '</div>';
    }
    h += '</div>';

    // Nombres sueltos
    if(c.sueltos.length){
      h += '<div class="cg-bloque"><div class="cg-bt" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><span>Nombres de remitos sin producto ('+c.sueltos.length+')</span>'+
        '<button type="button" class="cg-btn" data-cg="crear-todos">Crear un producto con cada uno</button></div>'+
        '<div class="rem-gris" style="margin-bottom:8px">Si dos nombres son el mismo producto (ej: "vaso topper spider man colgado" y "vaso spider man colgado"), vinculalos al mismo.</div>';
      c.sueltos.forEach(function(s){
        h += '<div class="cg-suelto"><div style="min-width:0"><b>'+esc(s.nombre)+'</b><div class="rem-gris">'+cant(s.ent)+' llevados · '+cant(s.pag)+' cobrados · '+peso(s.unit)+' c/u</div></div>'+
          '<div class="cg-suelto-acc"><select class="cg-in" data-cg-vincular="'+esc(s.n)+'"><option value="">Vincular a…</option>'+
          cat.slice().sort(function(a,b){return a.nombre.localeCompare(b.nombre);}).map(function(p){ return '<option value="'+p.id+'">'+esc(p.nombre)+'</option>'; }).join('')+'</select>'+
          '<button type="button" class="cg-btn" data-cg="crear" data-alias="'+esc(s.n)+'" data-nombre="'+esc(s.nombre)+'" data-precio="'+Math.round(s.unit)+'">Crear producto</button></div></div>';
      });
      h += '</div>';
    }
    return h + '</div>';
  }

  // ── Vista del cliente (Rubén): pantalla completa, letra grande, fotos ──
  var demo = { vendidos:{}, filtro:'', cat:'', toast:null };
  var CATS = [
    { id:'pochoclera', re:/pochocler|balde/, ico:'🍿', nom:'Pochocleras' },
    { id:'vaso',       re:/vaso|topper/,     ico:'🥤', nom:'Vasos' },
    { id:'llavero',    re:/llavero/,         ico:'🔑', nom:'Llaveros' },
    { id:'gorra',      re:/gorra/,           ico:'🧢', nom:'Gorras' },
    { id:'mascara',    re:/mascara|casco/,   ico:'🎭', nom:'Máscaras' },
    { id:'lampara',    re:/lampara|velador/, ico:'💡', nom:'Lámparas' },
    { id:'figura',     re:/figura|muneco/,   ico:'🦸', nom:'Figuras' }
  ];
  var CAT_OTROS = { id:'otros', ico:'🎁', nom:'Otros' };
  function catDe(nombre){ var n=norm(nombre); for(var i=0;i<CATS.length;i++) if(CATS[i].re.test(n)) return CATS[i]; return CAT_OTROS; }
  function itemsCliente(cliente){
    var c=calcular(cliente), out=[];
    c.lista.forEach(function(x){
      var stock = x.enCliente!=null ? x.enCliente : x.sinCobrar;
      if(stock>0) out.push({ k:'p:'+x.p.id, nombre:x.p.nombre, precio:x.precio, sugerido:num(x.p.sugerido), stock:stock, foto:x.p.foto||'' });
    });
    c.sueltos.forEach(function(s){ var st=s.ent-s.pag; if(st>0) out.push({ k:'n:'+s.n, nombre:s.nombre, precio:s.unit, sugerido:0, stock:st, foto:'' }); });
    out.forEach(function(it){ it.cat=catDe(it.nombre); });
    return out.sort(function(a,b){ return a.nombre.localeCompare(b.nombre); });
  }
  function renderDemo(cliente){
    var items=itemsCliente(cliente), q=norm(demo.filtro), totU=0, totM=0;
    items.forEach(function(it){ var v=demo.vendidos[it.k]||0; totU+=v; totM+=v*it.precio; });
    var usadas=[]; CATS.concat([CAT_OTROS]).forEach(function(c){ if(items.some(function(it){ return it.cat===c; })) usadas.push(c); });
    if(demo.cat && !usadas.some(function(c){ return c.id===demo.cat; })) demo.cat='';
    var h='<div class="cgr-in">'+
      '<div class="cgr-aviso"><span>Modo prueba: así lo ve '+esc(cliente)+'. Las ventas que marques acá no se guardan. Para ponerle foto a un producto, tocá su dibujo.</span><button type="button" data-cg="rub-salir">✕ Salir</button></div>'+
      '<div class="cgr-head"><img src="img/CHULENGO_LOGOO.png" alt=""><div><div class="cgr-marca">Chulengo Estudio</div><div class="cgr-h1">Productos en '+esc(cliente)+'</div></div></div>'+
      '<div class="cgr-total"><div><span>Para pagarle a Chulengo</span><b>'+peso(totM)+'</b><small>'+(totU?(totU===1?'1 producto vendido':cant(totU)+' productos vendidos'):'Todavía no anotaste ventas')+'</small></div></div>'+
      '<div class="cgr-ayuda">👉 Cuando vendas un producto, tocá el botón verde <b>VENDÍ 1</b>.</div>';
    if(usadas.length>1){
      h+='<div class="cgr-cats"><button type="button" class="cgr-cat'+(!demo.cat?' on':'')+'" data-cg="rub-cat" data-cat="">Todos</button>'+
        usadas.map(function(c){ return '<button type="button" class="cgr-cat'+(demo.cat===c.id?' on':'')+'" data-cg="rub-cat" data-cat="'+c.id+'"><i>'+c.ico+'</i> '+c.nom+'</button>'; }).join('')+'</div>';
    }
    if(items.length>10) h+='<input id="cgr-buscar" class="cgr-buscar" placeholder="🔍 Buscar por nombre..." value="'+esc(demo.filtro)+'">';
    h+='<div class="cgr-lista">';
    var vis=items.filter(function(it){ return (!demo.cat||it.cat.id===demo.cat) && (!q||norm(it.nombre).indexOf(q)!==-1); });
    vis.sort(function(a,b){ var qa=a.stock-(demo.vendidos[a.k]||0)>0?0:1, qb=b.stock-(demo.vendidos[b.k]||0)>0?0:1; return qa-qb; });
    vis.forEach(function(it){
      var v=demo.vendidos[it.k]||0, quedan=Math.max(0,it.stock-v);
      h+='<div class="cgr-item'+(quedan===0?' agotado':'')+(demo.toast&&demo.toast.k===it.k?' recien':'')+'">'+
        '<div class="cgr-fila">'+
          '<button type="button" class="cgr-foto" data-cg="rub-foto" data-k="'+esc(it.k)+'" aria-label="Foto">'+
            (it.foto?'<img src="'+esc(it.foto)+'" alt="">':'<i>'+it.cat.ico+'</i>')+'</button>'+
          '<div class="cgr-info"><div class="cgr-nom">'+esc(it.nombre)+'</div>'+
            '<div class="cgr-quedan">'+(quedan===0?'<b class="cero">No queda ninguno</b>':'Quedan <b>'+cant(quedan)+'</b>')+'</div>'+
            (it.sugerido?'<div class="cgr-sub">Se vende a <b>'+peso(it.sugerido)+'</b></div>':'')+
            '<div class="cgr-sub">A Chulengo: '+peso(it.precio)+'</div></div>'+
        '</div>'+
        '<button type="button" class="cgr-vendi" data-cg="rub-vendi" data-k="'+esc(it.k)+'"'+(quedan===0?' disabled':'')+'>'+(quedan===0?'Sin stock':'✓ VENDÍ 1')+'</button>'+
        (v?'<div class="cgr-vend"><span>Vendiste <b>'+cant(v)+'</b><br><span style="white-space:nowrap">'+peso(v*it.precio)+'</span></span><button type="button" class="cgr-menos" data-cg="rub-menos" data-k="'+esc(it.k)+'">↩ Me equivoqué</button></div>':'')+
      '</div>';
    });
    if(!items.length) h+='<div class="cgr-vacio">No hay productos de Chulengo para vender en este momento.</div>';
    else if(!vis.length) h+='<div class="cgr-vacio">No encontré ningún producto con ese nombre.</div>';
    h+='</div>'+
      (totU?'<button type="button" class="cgr-reset" data-cg="rub-reset">Borrar todo lo anotado (solo en la prueba)</button>':'')+
      '</div>'+
      (demo.toast?'<div class="cgr-toast">✓ Anotado: 1 '+esc(demo.toast.nombre)+'</div>':'');
    return h;
  }
  function pintarVistaCliente(cliente){
    var ov=$('cgr-overlay');
    if(!ov){ ov=document.createElement('div'); ov.id='cgr-overlay'; ov.className='cg cgr'; document.body.appendChild(ov); }
    ov.innerHTML = renderDemo(cliente);
    document.body.classList.add('cgr-abierto');
  }
  function cerrarVistaCliente(){
    var ov=$('cgr-overlay'); if(ov) ov.remove();
    document.body.classList.remove('cgr-abierto');
  }

  // ── Fotos de los productos (se guardan chiquitas dentro del catálogo) ──
  var fotoPend = null;
  function pedirFoto(cliente, k){
    var inp=$('cg-foto-in');
    if(!inp){
      inp=document.createElement('input'); inp.type='file'; inp.accept='image/*'; inp.id='cg-foto-in'; inp.style.display='none';
      document.body.appendChild(inp);
      inp.addEventListener('change', function(){
        var f=inp.files && inp.files[0], pend=fotoPend; inp.value=''; fotoPend=null;
        if(!f || !pend) return;
        achicarFoto(f).then(function(url){ ponerFoto(pend.cliente, pend.k, url); })
          .catch(function(){ alert('No pude leer esa imagen. Probá con otra foto.'); });
      });
    }
    fotoPend={cliente:cliente, k:k}; inp.click();
  }
  function achicarFoto(file){
    return new Promise(function(ok, mal){
      var url=URL.createObjectURL(file), im=new Image();
      im.onload=function(){
        try{
          var L=240, cv=document.createElement('canvas'); cv.width=L; cv.height=L;
          var cx=cv.getContext('2d'); cx.fillStyle='#fff'; cx.fillRect(0,0,L,L);
          var lado=Math.min(im.naturalWidth, im.naturalHeight);
          cx.drawImage(im, (im.naturalWidth-lado)/2, (im.naturalHeight-lado)/2, lado, lado, 0, 0, L, L);
          URL.revokeObjectURL(url); ok(cv.toDataURL('image/jpeg', 0.7));
        }catch(e){ mal(e); }
      };
      im.onerror=function(){ URL.revokeObjectURL(url); mal(new Error('imagen')); };
      im.src=url;
    });
  }
  function ponerFoto(cliente, k, url){
    var cat=catalogo(cliente), p=null;
    if(k.indexOf('p:')===0) p=prodPorId(cliente, k.slice(2));
    else {
      // Nombre de remito que todavía no era producto: se crea el producto para poder guardarle la foto
      var n=k.slice(2), s=calcular(cliente).sueltos.find(function(y){ return y.n===n; });
      if(!s) return;
      p={id:nuevoId(), nombre:s.nombre, alias:[s.n], costo:'', precio:String(Math.round(s.unit)), sugerido:'', minimo:''};
      cat.push(p);
      if(demo.vendidos[k]){ demo.vendidos['p:'+p.id]=demo.vendidos[k]; delete demo.vendidos[k]; }
    }
    if(!p) return;
    var antes=p.foto; p.foto=url;
    if(JSON.stringify(cat).length > 850000){
      p.foto=antes||''; alert('Ya hay muchas fotos cargadas y no entra una más. Avisale a Claude para pasar las fotos a otro lugar.'); return;
    }
    guardar(cliente); refrescar();
  }

  // ── Acciones ──
  function cliActual(){ return (typeof remNav!=='undefined' && (remNav.tipo==='consig'||remNav.tipo==='consig-rub')) ? remNav.cliente : null; }
  var tRef=null;
  function refrescar(despues){
    clearTimeout(tRef);
    tRef=setTimeout(function(){ renderHistorialRemitos(); if(despues) despues(); },0);
  }
  function prodPorId(cliente,id){ return catalogo(cliente).find(function(p){ return p.id===id; }); }

  document.addEventListener('click', function(e){
    var cliente = cliActual(); if(!cliente) return;
    var b = e.target.closest('[data-cg]'); if(!b || !b.closest('.cg')) return;
    var cat = catalogo(cliente), acc=b.dataset.cg, p;
    if(acc==='rub-vendi'){
      var itV=itemsCliente(cliente).find(function(y){ return y.k===b.dataset.k; }); if(!itV) return;
      if((demo.vendidos[itV.k]||0)>=itV.stock) return;
      demo.vendidos[itV.k]=(demo.vendidos[itV.k]||0)+1;
      var marca={k:itV.k, nombre:itV.nombre}; demo.toast=marca;
      try{ if(navigator.vibrate) navigator.vibrate(35); }catch(_){}
      setTimeout(function(){ if(demo.toast===marca){ demo.toast=null; if(remNav.tipo==='consig-rub') refrescar(); } }, 2600);
      refrescar(); return;
    }
    if(acc==='rub-menos'){ demo.vendidos[b.dataset.k]=Math.max(0,(demo.vendidos[b.dataset.k]||0)-1); demo.toast=null; refrescar(); return; }
    if(acc==='rub-reset'){ if(!confirm('¿Borrar todo lo anotado en la prueba?')) return; demo.vendidos={}; demo.toast=null; refrescar(); return; }
    if(acc==='rub-cat'){ demo.cat=b.dataset.cat||''; refrescar(function(){ var ov=$('cgr-overlay'); if(ov) ov.scrollTop=0; }); return; }
    if(acc==='rub-foto'){ pedirFoto(cliente, b.dataset.k); return; }
    if(acc==='rub-salir'){ remVolver(); return; }
    if(acc==='foto'){ pedirFoto(cliente, 'p:'+b.dataset.pid); return; }
    if(acc==='foto-quitar'){ p=prodPorId(cliente,b.dataset.pid); if(!p) return; delete p.foto; guardar(cliente); refrescar(); return; }
    if(acc==='ver-rub'){ demo.vendidos={}; demo.filtro=''; demo.cat=''; demo.toast=null; remIr({tipo:'consig-rub', cliente:cliente}); return; }
    if(acc==='abrir'){ estado.abierto = estado.abierto===b.dataset.pid ? null : b.dataset.pid; refrescar(); return; }
    if(acc==='nuevo'){
      var nom=(prompt('Nombre del producto:')||'').trim(); if(!nom) return;
      if(productoDeNombre(cat,nom)){ alert('Ya hay un producto con ese nombre.'); return; }
      p={id:nuevoId(), nombre:nom, alias:[norm(nom)], costo:'', precio:'', sugerido:'', minimo:''}; cat.push(p); estado.abierto=p.id; guardar(cliente); refrescar(); return;
    }
    if(acc==='crear'){
      cat.push({id:nuevoId(), nombre:b.dataset.nombre, alias:[b.dataset.alias], costo:'', precio:b.dataset.precio||'', sugerido:'', minimo:''});
      guardar(cliente); refrescar(); return;
    }
    if(acc==='crear-todos'){
      var c=calcular(cliente);
      if(!confirm('Se van a crear '+c.sueltos.length+' productos, uno por cada nombre. Después podés unir los que sean el mismo. ¿Seguimos?')) return;
      c.sueltos.forEach(function(s){ cat.push({id:nuevoId(), nombre:s.nombre, alias:[s.n], costo:'', precio:String(Math.round(s.unit)), sugerido:'', minimo:''}); });
      guardar(cliente); refrescar(); return;
    }
    if(acc==='desvincular'){ p=prodPorId(cliente,b.dataset.pid); if(!p) return; p.alias=(p.alias||[]).filter(function(a){ return a!==b.dataset.alias; }); guardar(cliente); refrescar(); return; }
    if(acc==='borrar'){
      p=prodPorId(cliente,b.dataset.pid); if(!p) return;
      if(!confirm('¿Borrar "'+p.nombre+'" del catálogo? Los remitos no se tocan; sus renglones vuelven a "sin producto".')) return;
      cat.splice(cat.indexOf(p),1); estado.abierto=null; guardar(cliente); refrescar(); return;
    }
    if(acc==='cobrar'){
      p=prodPorId(cliente,b.dataset.pid); if(!p) return;
      var x=calcular(cliente).lista.find(function(y){ return y.p.id===p.id; });
      if(!confirm('Se van a marcar como cobradas las '+cant(x.sinCobrar)+' unidades de "'+p.nombre+'" que figuran sin cobrar en '+x.renglones.filter(function(f){return f.cant>f.pagadas;}).length+' remito(s). ¿Seguimos?')) return;
      var porRem={};
      x.renglones.forEach(function(f){ if(f.cant>f.pagadas){ (porRem[f.rem.id]=porRem[f.rem.id]||{rem:f.rem, idxs:[]}).idxs.push(f.idx); } });
      var ps = Object.keys(porRem).map(function(id){
        var o=porRem[id], nuevos=JSON.parse(JSON.stringify(o.rem.renglones));
        o.idxs.forEach(function(i){ nuevos[i].cantidadPagada = parseNumeroRemito(nuevos[i].cantidad||'1')||1; });
        return firebase.firestore().collection('remitos_historial').doc(id).update({renglones:nuevos}).then(function(){ o.rem.renglones=nuevos; });
      });
      b.disabled=true; b.textContent='Guardando...';
      Promise.all(ps).then(function(){ refrescar(); }).catch(function(err){ alert('No se pudo guardar: '+err.message); refrescar(); });
      return;
    }
  });

  document.addEventListener('change', function(e){
    var cliente = cliActual(); if(!cliente || !e.target.closest('.cg')) return;
    var cat=catalogo(cliente), t=e.target, p;
    if(t.dataset.cgVincular!==undefined){
      p=prodPorId(cliente,t.value); if(!p) return;
      p.alias=p.alias||[]; if(p.alias.indexOf(t.dataset.cgVincular)===-1) p.alias.push(t.dataset.cgVincular);
      guardar(cliente); refrescar(); return;
    }
    if(t.dataset.cgUnir!==undefined){
      var a=prodPorId(cliente,t.dataset.cgUnir), dest=prodPorId(cliente,t.value); if(!a||!dest) return;
      if(!confirm('¿Unir "'+a.nombre+'" dentro de "'+dest.nombre+'"? Queda un solo producto con los remitos de los dos.')) { t.value=''; return; }
      dest.alias=dest.alias||[]; aliasDe(a).forEach(function(x){ if(dest.alias.indexOf(x)===-1) dest.alias.push(x); });
      ['costo','precio','sugerido','minimo','foto'].forEach(function(k){ if(!dest[k] && a[k]) dest[k]=a[k]; });
      cat.splice(cat.indexOf(a),1); estado.abierto=dest.id; guardar(cliente); refrescar(); return;
    }
    if(t.dataset.cgCampo){
      p=prodPorId(cliente,t.dataset.pid); if(!p) return;
      var k=t.dataset.cgCampo, v=t.value.trim();
      if(k==='nombre'){
        if(!v) { t.value=p.nombre; return; }
        p.alias=p.alias||[]; var viejo=norm(p.nombre); if(viejo && p.alias.indexOf(viejo)===-1) p.alias.push(viejo);
        p.nombre=v;
      } else if(k==='contado'){
        p.contado = v==='' ? null : { n: num(v), fecha: hoyTxt() };
      } else p[k] = v==='' ? '' : num(v);
      guardar(cliente); refrescar();
    }
  });
  document.addEventListener('input', function(e){
    var id=e.target.id; if((id!=='cg-buscar' && id!=='cgr-buscar') || !cliActual()) return;
    if(id==='cg-buscar') estado.filtro = e.target.value; else demo.filtro = e.target.value;
    var pos=e.target.selectionStart;
    refrescar(function(){ var nb=$(id); if(nb){ nb.focus(); try{ nb.setSelectionRange(pos,pos); }catch(_){} } });
  });

  // ── Enganches con la página ──
  function enganchar(){
    if(window._cgListo || typeof renderHistorialRemitos!=='function' || typeof renderFichaCliente!=='function') return;
    window._cgListo = true;

    var renderOrig = renderHistorialRemitos;
    window.renderHistorialRemitos = function(animar){
      if(typeof remNav!=='undefined' && (remNav.tipo==='consig'||remNav.tipo==='consig-rub')){
        var cont=$('remito-historial-clientes'); if(!cont) return;
        var tb=document.querySelector('#remito-historial-wrap .rem-toolbar'); if(tb) tb.style.display='none';
        if(remNav.tipo==='consig-rub'){ pintarVistaCliente(remNav.cliente); return; }
        cerrarVistaCliente();
        cont.innerHTML = '<div class="rem-vista'+(animar?' entra':'')+'">'+render(remNav.cliente)+'</div>';
        return;
      }
      cerrarVistaCliente();
      return renderOrig.apply(this, arguments);
    };

    var fichaOrig = renderFichaCliente;
    window.renderFichaCliente = function(cliente){
      var h = fichaOrig.apply(this, arguments);
      if(!h) return h;
      var r = consigResumen(cliente);
      var bloque = '<div class="rem-bloque cg-acceso" data-cg-abrir="'+esc(cliente)+'">'+
        '<div><div class="rem-bloque-t" style="margin:0">📦 Stock y catálogo</div><div class="rem-gris">'+
        (r.productos ? r.productos+' productos · '+cant(r.unidades)+' u. sin cobrar'+(r.producir?' · <b style="color:#1D4ED8">reponer '+cant(r.producir)+' u.</b>':'')
                     : 'Armá el catálogo para ver qué hay en el lugar y qué reponer')+
        '</div></div><span class="rem-flecha">›</span></div>';
      var marca = '<div class="rem-bloque"><div class="rem-bloque-t" style="display:flex';
      var i = h.indexOf(marca);
      return i===-1 ? h.replace('<div class="rem-bloque"><div class="rem-bloque-t">Remitos</div>', bloque+'<div class="rem-bloque"><div class="rem-bloque-t">Remitos</div>') : h.slice(0,i)+bloque+h.slice(i);
    };
    document.addEventListener('click', function(e){
      var a=e.target.closest('[data-cg-abrir]'); if(a) consigAbrir(a.dataset.cgAbrir);
    });

    // Remito: sugerir los productos del catálogo del cliente y completar el precio
    if(typeof crearFilaRemitoDOM==='function'){
      var filaOrig = crearFilaRemitoDOM;
      window.crearFilaRemitoDOM = function(r, idx){
        var fila = filaOrig.apply(this, arguments);
        var inp = fila.querySelector('input[data-campo="producto"]');
        if(inp){
          inp.setAttribute('list','cg-productos-lista'); inp.setAttribute('autocomplete','off');
          inp.addEventListener('change', function(){
            var cli=(($('remito-nombre')||{}).value||'').trim().toUpperCase(), p=productoDeNombre(catalogo(cli), inp.value);
            if(!p) return;
            if(inp.value!==p.nombre){ inp.value=p.nombre; remitoRenglones[idx].producto=p.nombre; }
            var pr=fila.querySelector('input[data-campo="precio"]');
            if(pr && !pr.value.trim() && num(p.precio)){ pr.value=String(num(p.precio)); remitoRenglones[idx].precio=pr.value; if(typeof actualizarPreviewRemito==='function') actualizarPreviewRemito(); }
          });
        }
        return fila;
      };
    }
    var dl=document.createElement('datalist'); dl.id='cg-productos-lista'; document.body.appendChild(dl);
    function llenarLista(){
      var cli=(($('remito-nombre')||{}).value||'').trim().toUpperCase();
      dl.innerHTML = catalogo(cli).map(function(p){ return '<option value="'+esc(p.nombre)+'">'; }).join('');
    }
    document.addEventListener('focusin', function(e){ if(e.target.matches && e.target.matches('input[data-campo="producto"]')) llenarLista(); });

    var st=document.createElement('style');
    st.textContent =
      '.cg-acceso{display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;border-color:#BFDBFE!important;background:#F5F9FF!important}'+
      '.cg-acceso:hover{background:#EBF3FF!important}'+
      '.cg{font-family:Inter,sans-serif;color:#1A1814}'+
      '.cg-tit{margin:4px 0 12px}.cg-h1{font-size:1.15rem;font-weight:800}'+
      '.cg-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:12px}'+
      '.cg-kpi{background:#fff;border:1px solid #E2DDD6;border-radius:12px;padding:10px 12px}.cg-kpi span{display:block;font-size:0.7rem;color:#8A8479;font-weight:700;text-transform:uppercase;letter-spacing:0.04em}.cg-kpi b{font-size:1.15rem}'+
      '.cg-bloque{background:#fff;border:1px solid #E2DDD6;border-radius:12px;padding:12px 14px;margin-bottom:12px}'+
      '.cg-bt{font-weight:700;font-size:0.92rem;margin-bottom:10px}'+
      '.cg-producir{border-color:#BFDBFE;background:#F5F9FF}.cg-prod-row{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #E5EDF9;font-size:0.88rem}.cg-prod-row:last-child{border:none}.cg-prod-row b{color:#1D4ED8}'+
      '.cg-in{padding:7px 9px;border:1.5px solid #E2DDD6;border-radius:8px;font-size:0.84rem;font-family:Inter,sans-serif;box-sizing:border-box;width:100%;background:#fff;color:#1A1814}'+
      '.cg-btn{padding:7px 12px;border:1px solid #E2DDD6;background:#F5F2ED;border-radius:8px;font-size:0.8rem;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;white-space:nowrap;color:#1A1814}'+
      '.cg-btn.verde{background:#2D6A4F;color:#fff;border-color:#2D6A4F}.cg-btn.rojo{background:#FEF2F2;color:#B91C1C;border-color:#FECACA}'+
      '.cg-fila{display:grid;grid-template-columns:minmax(0,2.4fr) repeat(7,minmax(0,1fr)) 18px;gap:8px;align-items:center;padding:9px 4px;font-size:0.84rem;cursor:pointer}'+
      '.cg-cab{font-size:0.66rem;font-weight:700;color:#8A8479;text-transform:uppercase;letter-spacing:0.04em;cursor:default;border-bottom:1px solid #E2DDD6}'+
      '.cg-item{border-bottom:1px solid #F0ECE6}.cg-item.abierto{background:#FAF8F5}'+
      '.cg-nom{font-weight:600}.cg-tag{font-style:normal;font-size:0.68rem;font-weight:700;border-radius:20px;padding:1px 7px;margin-left:4px;white-space:nowrap}.cg-tag.azul{background:#DBEAFE;color:#1D4ED8}.cg-tag.rojo{background:#FEE2E2;color:#B91C1C}'+
      '.cg-neg{color:#B91C1C;font-weight:700}.cg-chev{color:#A09890}'+
      '.cg-edit{padding:4px 6px 14px}.cg-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.cg-grid label{font-size:0.72rem;font-weight:600;color:#6B665E;display:flex;flex-direction:column;gap:3px}'+
      '.cg-sub{font-size:0.7rem;font-weight:700;color:#8A8479;text-transform:uppercase;letter-spacing:0.04em;margin:12px 0 6px}'+
      '.cg-chips{display:flex;flex-wrap:wrap;gap:5px}.cg-chip{background:#F0ECE6;border-radius:20px;padding:3px 9px;font-size:0.75rem}.cg-chip button{border:none;background:none;color:#B91C1C;cursor:pointer;padding:0 0 0 3px}'+
      '.cg-entregas div{display:flex;justify-content:space-between;gap:10px;font-size:0.78rem;padding:3px 0;border-bottom:1px dashed #E2DDD6;color:#4A453E}'+
      '.cg-acc{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}'+
      '.cg-vacio{font-size:0.85rem;color:#8A8479;padding:8px 0}'+
      '.cg-suelto{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-top:1px solid #F0ECE6;font-size:0.85rem}.cg-suelto-acc{display:flex;gap:6px;flex-shrink:0}.cg-suelto-acc select{width:190px}'+
      '@media(max-width:760px){'+
        '.cg-cab{display:none}.cg-fila{grid-template-columns:repeat(3,minmax(0,1fr));row-gap:4px}'+
        '.cg-fila .cg-nom{grid-column:1 / 3}.cg-fila .cg-chev{grid-column:3;grid-row:1;text-align:right}'+
        '.cg-fila span[data-l]::before{content:attr(data-l);display:block;font-size:0.62rem;color:#A09890;font-weight:700;text-transform:uppercase}'+
        '.cg-grid{grid-template-columns:1fr 1fr}.cg-suelto{flex-direction:column;align-items:stretch}.cg-suelto-acc select{width:100%;flex:1}}'+
      '.cg-fotofila{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.cg-fotofila img,.cg-sinfoto{width:64px;height:64px;border-radius:10px;object-fit:cover;border:1px solid #E2DDD6;background:#F5F2ED;display:flex;align-items:center;justify-content:center;font-size:1.8rem}'+
      'body.cgr-abierto{overflow:hidden}'+
      '.cgr{position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;overflow-y:auto;-webkit-overflow-scrolling:touch;background:#F3EFE8;color:#1A1814!important;font-family:Inter,system-ui,sans-serif;font-size:18px;line-height:1.3}'+
      '.cgr-in{max-width:620px;margin:0 auto;padding:12px 14px 110px}'+
      '.cgr button{font-family:inherit;-webkit-tap-highlight-color:transparent}'+
      '.cgr-aviso{background:#FEF3C7;color:#78350F;border-radius:12px;padding:10px 12px;font-size:0.78em;font-weight:600;margin-bottom:14px;display:flex;gap:10px;align-items:center;justify-content:space-between}'+
      '.cgr-aviso button{flex-shrink:0;background:#fff;border:1px solid #E7C873;color:#78350F;border-radius:10px;padding:10px 12px;font-weight:700;font-size:1em;cursor:pointer}'+
      '.cgr-head{display:flex;align-items:center;gap:12px;margin-bottom:14px}.cgr-head img{width:54px;height:54px;border-radius:12px;object-fit:cover}'+
      '.cgr-marca{font-size:0.72em;font-weight:800;color:#2D6A4F;text-transform:uppercase;letter-spacing:0.06em}.cgr-h1{font-size:1.3em;font-weight:800;line-height:1.15}'+
      '.cgr-total{background:#1A1814;color:#fff;border-radius:18px;padding:16px 20px;margin-bottom:12px;position:sticky;top:8px;z-index:5;box-shadow:0 6px 18px rgba(0,0,0,0.18)}'+
      '.cgr-total span{display:block;font-size:0.9em;font-weight:600;color:#D6D1C8}.cgr-total b{display:block;font-size:2.1em;font-weight:800;line-height:1.1;margin:2px 0}.cgr-total small{font-size:0.85em;color:#D6D1C8}'+
      '.cgr-ayuda{font-size:0.95em;color:#3F3A33;margin:0 2px 14px}'+
      '.cgr-cats{display:flex;gap:8px;overflow-x:auto;padding:2px 2px 10px;margin:0 -2px 6px;scrollbar-width:none}.cgr-cats::-webkit-scrollbar{display:none}'+
      '.cgr-cat{flex-shrink:0;background:#fff;border:2px solid #D9D3C9;border-radius:999px;padding:12px 18px;font-size:1em;font-weight:700;color:#1A1814;cursor:pointer;white-space:nowrap}.cgr-cat i{font-style:normal}'+
      '.cgr-cat.on{background:#1A1814;border-color:#1A1814;color:#fff}'+
      '.cgr-buscar{width:100%;box-sizing:border-box;padding:15px 16px;font-size:1em;border-radius:14px;border:2px solid #D9D3C9;background:#fff;color:#1A1814;margin-bottom:12px;font-family:inherit}'+
      '.cgr-item{background:#fff;border:1px solid #DDD7CD;border-radius:20px;padding:14px;margin-bottom:14px;box-shadow:0 1px 3px rgba(0,0,0,0.05)}'+
      '.cgr-item.recien{animation:cgrFlash 0.9s ease}@keyframes cgrFlash{0%{box-shadow:0 0 0 4px #34D399;background:#ECFDF5}100%{box-shadow:0 1px 3px rgba(0,0,0,0.05);background:#fff}}'+
      '.cgr-fila{display:flex;gap:14px;align-items:center;margin-bottom:12px}'+
      '.cgr-foto{flex-shrink:0;width:112px;height:112px;border-radius:16px;border:1px solid #E2DDD6;background:#F5F2ED;padding:0;overflow:hidden;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:#6B665E}'+
      '.cgr-foto img{width:100%;height:100%;object-fit:cover;display:block}.cgr-foto i{font-style:normal;font-size:3em;line-height:1}.cgr-foto em{font-style:normal;font-size:0.6em;font-weight:700}'+
      '.cgr-info{flex:1;min-width:0}.cgr-nom{font-weight:800;font-size:1.2em;line-height:1.2;margin-bottom:6px;overflow-wrap:anywhere}'+
      '.cgr-quedan{font-size:1.05em;margin-bottom:4px}.cgr-quedan b{font-size:1.35em;font-weight:800}.cgr-quedan b.cero{font-size:1em;color:#B91C1C}'+
      '.cgr-sub{font-size:0.9em;color:#4A453E}.cgr-sub b{color:#1A1814}'+
      '.cgr-vendi{display:block;width:100%;background:#1F7A4D;color:#fff;border:none;border-radius:16px;padding:0 16px;height:66px;font-size:1.35em;font-weight:800;letter-spacing:0.02em;cursor:pointer;box-shadow:0 3px 0 #14532D}'+
      '.cgr-vendi:active{transform:translateY(2px);box-shadow:0 1px 0 #14532D}.cgr-vendi:disabled{background:#CFCAC1;color:#6B665E;box-shadow:none;cursor:default;transform:none}'+
      '.cgr-vend{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;background:#ECFDF5;border:1px solid #A7F3D0;border-radius:14px;padding:8px 8px 8px 14px;font-size:0.95em;color:#14532D}'+
      '.cgr-menos{flex-shrink:0;background:#fff;border:2px solid #D9D3C9;border-radius:12px;padding:0 14px;height:50px;font-size:0.95em;font-weight:700;color:#1A1814;cursor:pointer}'+
      '.cgr-item.agotado .cgr-fila{opacity:0.55}'+
      '.cgr-vacio{background:#fff;border:1px dashed #D9D3C9;border-radius:16px;padding:24px 16px;text-align:center;color:#4A453E}'+
      '.cgr-reset{display:block;margin:18px auto 0;background:none;border:none;color:#6B665E;text-decoration:underline;font-size:0.85em;padding:12px;cursor:pointer}'+
      '.cgr-toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);background:#14532D;color:#fff;font-weight:700;font-size:1.05em;padding:14px 22px;border-radius:999px;box-shadow:0 8px 24px rgba(0,0,0,0.3);max-width:92vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;z-index:6;pointer-events:none}'+
      '@media(max-width:380px){.cgr{font-size:17px}.cgr-foto{width:96px;height:96px}}'+
      'body.dark .cg-bloque,body.dark .cg-kpi{background:#1A1A1A;border-color:#2A2A2A;color:#FAFAFA}body.dark .cg{color:#FAFAFA}';
    document.head.appendChild(st);
  }
  window.cgUtil = { catDe:catDe, achicarFoto:achicarFoto, calcular:calcular, catalogo:catalogo, productoDeNombre:productoDeNombre };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', enganchar); else enganchar();
})();
