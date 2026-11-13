// ═══ Página en vivo para clientes en consignación (ej: el Candy del cine) ═══
// El cliente (Rubén) entra con su Google, ve los productos que hay en su local
// y toca "VENDÍ 1" cada vez que vende. Fabri ve todo en vivo y marca cuando le pagan.
//
// Firestore:
//   consig_portal/{pid}          { cliente, titulo, emails:[], items:[{id,nombre,precio,sugerido,entregadas,foto,oculto,catId}], equipo }
//   consig_portal/{pid}/ventas   { k, nombre, precio, cant:+1|-1, email, fecha, cobrada }
//   consig_acceso/{email}        { pid, cliente }      ← para saber a qué página entra cada cliente
// Quedan = entregadas − suma de todas las ventas (cobradas o no).
// Para pagar = ventas no cobradas × precio de ese momento.
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
  function fechaDe(v){ var t=v.fecha, d = t && t.toDate ? t.toDate() : (t && t.seconds ? new Date(t.seconds*1000) : (t ? new Date(t) : new Date())); return isNaN(d) ? new Date() : d; }
  function fechaTxt(d){ return pad(d.getDate())+'/'+pad(d.getMonth()+1)+' '+pad(d.getHours())+':'+pad(d.getMinutes()); }
  function tituloDe(cliente){ var c=String(cliente||'').toLowerCase(); if(/cine/.test(c)) return 'el Candy'; return c.replace(/\b\w/g,function(x){return x.toUpperCase();}); }
  function errPermiso(e){ return /permission|insufficient/i.test((e&&e.message)||''); }

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
  function resumen(extra){
    var por={}, tot={u:0,m:0};
    items().forEach(function(it){ por[it.id]={vend:0,sinCob:0,plata:0}; });
    P.ventas.concat(extra||[]).forEach(function(v){
      var x = por[v.k] || (por[v.k]={vend:0,sinCob:0,plata:0}), c=num(v.cant);
      x.vend += c;
      if(!v.cobrada){ x.sinCob += c; x.plata += c*num(v.precio); tot.u += c; tot.m += c*num(v.precio); }
    });
    return { por:por, tot:tot };
  }
  function quedanDe(it, r){ return Math.max(0, num(it.entregadas) - ((r.por[it.id]||{}).vend||0)); }
  function vendidasDe(id){ var t=0; P.ventas.forEach(function(v){ if(v.k===id) t+=num(v.cant); }); return t; }

  var tAvisar=null;
  function avisar(){
    clearTimeout(tAvisar);
    tAvisar=setTimeout(function(){
      if($('pt-overlay')) pintarOverlay();
      if(typeof remNav!=='undefined' && remNav.tipo==='portal'){
        var a=document.activeElement;
        if(a && a.closest && a.closest('.pt-adm') && /INPUT|TEXTAREA|SELECT/.test(a.tagName)){ A.pendiente=true; return; }
        renderHistorialRemitos();
      }
    }, 30);
  }

  // ═════════ Pantalla del cliente (Rubén) ═════════
  // V.modo: 'login' | 'sinAcceso' | 'cliente' | 'vista' (Fabri mirando, no guarda ventas)
  var V = { modo:null, cat:'', filtro:'', toast:null, locales:[], ultimoToque:{}, verPend:false };

  function abrirOverlay(modo){
    V.modo=modo; V.cat=''; V.filtro=''; V.toast=null; V.locales=[]; V.verPend=false;
    var ov=$('pt-overlay');
    if(!ov){ ov=document.createElement('div'); ov.id='pt-overlay'; ov.className='cg cgr'; document.body.appendChild(ov); }
    document.body.classList.add('pt-abierto');
    pintarOverlay();
    ov.scrollTop=0;
  }
  function cerrarOverlay(){ var ov=$('pt-overlay'); if(ov) ov.remove(); document.body.classList.remove('pt-abierto'); V.modo=null; }

  function cabecera(sub){
    return '<div class="cgr-head"><img src="img/CHULENGO_LOGOO.png" alt=""><div><div class="cgr-marca">Chulengo Estudio</div><div class="cgr-h1">'+sub+'</div></div></div>';
  }

  function htmlOverlay(){
    if(V.modo==='login'){
      return '<div class="cgr-in pt-centro">'+cabecera('Productos en el Candy')+
        '<p class="pt-txt">Para ver los productos y anotar lo que vendés, entrá con tu cuenta de Google.</p>'+
        '<button type="button" class="pt-google" data-pt="login">Entrar con Google</button>'+
        '<p class="pt-chico">Se hace una sola vez. Después queda abierto en este celular.</p></div>';
    }
    if(V.modo==='sinAcceso'){
      return '<div class="cgr-in pt-centro">'+cabecera('Todavía no tenés acceso')+
        '<p class="pt-txt">Entraste con <b>'+esc(emailAct())+'</b>, pero esa cuenta todavía no está habilitada.</p>'+
        '<p class="pt-txt">Pasale este correo a Fabri para que te dé acceso.</p>'+
        '<button type="button" class="pt-secund" data-pt="salir-cuenta">Entrar con otra cuenta</button>'+
        (esEquipo()?'<button type="button" class="pt-secund" data-pt="cerrar">Ir a la página de Chulengo</button>':'')+'</div>';
    }
    if(P.err){
      return '<div class="cgr-in pt-centro">'+cabecera('No se pudo abrir')+
        '<p class="pt-txt">'+(errPermiso(P.err)?'Falta habilitar el acceso. Avisale a Fabri.':'Revisá que haya internet y volvé a abrir la página.')+'</p>'+
        '<button type="button" class="pt-secund" data-pt="recargar">Volver a intentar</button>'+
        (V.modo==='vista'||esEquipo()?'<button type="button" class="pt-secund" data-pt="cerrar">Cerrar</button>':'')+'</div>';
    }
    if(P.cargando || !P.doc){
      return '<div class="cgr-in pt-centro">'+cabecera('Cargando…')+'<p class="pt-txt">Un segundo…</p>'+
        (V.modo==='vista'?'<button type="button" class="pt-secund" data-pt="cerrar">Cerrar</button>':'')+'</div>';
    }

    var r=resumen(V.locales), q=norm(V.filtro);
    var lista = items().filter(function(it){ return !it.oculto; }).map(function(it){
      return { it:it, quedan:quedanDe(it,r), sinCob:Math.max(0,(r.por[it.id]||{}).sinCob||0), cat:catDe(it.nombre) };
    }).sort(function(a,b){ return (a.quedan>0?0:1)-(b.quedan>0?0:1) || a.it.nombre.localeCompare(b.it.nombre); });
    var usadas=[]; lista.forEach(function(x){ if(usadas.indexOf(x.cat)===-1) usadas.push(x.cat); });
    if(V.cat && !usadas.some(function(c){ return c.id===V.cat; })) V.cat='';

    var h='<div class="cgr-in">';
    if(V.modo==='vista') h+='<div class="cgr-aviso"><span>Así lo ve el cliente, con los datos reales. Lo que toques acá no se guarda. Tocá un dibujo para ponerle foto.</span><button type="button" data-pt="cerrar">✕ Salir</button></div>';
    else if(esEquipo()) h+='<div class="cgr-aviso"><span>Estás en la página del cliente con tu cuenta.</span><button type="button" data-pt="cerrar">✕ Salir</button></div>';
    h+=cabecera('Productos en '+esc(P.doc.titulo||tituloDe(P.doc.cliente)));
    h+='<div class="cgr-total"><div><span>Para pagarle a Chulengo</span><b>'+peso(r.tot.m)+'</b><small>'+
      (r.tot.u ? (r.tot.u===1?'1 producto vendido':cant(r.tot.u)+' productos vendidos')+' sin pagar' : 'No hay ventas sin pagar')+'</small></div></div>';
    h+='<div class="cgr-ayuda">👉 Cuando vendas un producto, tocá el botón verde <b>VENDÍ 1</b>.</div>';
    if(usadas.length>1){
      h+='<div class="cgr-cats"><button type="button" class="cgr-cat'+(!V.cat?' on':'')+'" data-pt="cat" data-cat="">Todos</button>'+
        usadas.map(function(c){ return '<button type="button" class="cgr-cat'+(V.cat===c.id?' on':'')+'" data-pt="cat" data-cat="'+c.id+'"><i>'+c.ico+'</i> '+c.nom+'</button>'; }).join('')+'</div>';
    }
    if(lista.length>10) h+='<input id="pt-buscar" class="cgr-buscar" placeholder="🔍 Buscar por nombre..." value="'+esc(V.filtro)+'">';
    h+='<div class="cgr-lista">';
    var vis = lista.filter(function(x){ return (!V.cat||x.cat.id===V.cat) && (!q||norm(x.it.nombre).indexOf(q)!==-1); });
    vis.forEach(function(x){
      var it=x.it;
      h+='<div class="cgr-item'+(x.quedan===0?' agotado':'')+(V.toast&&V.toast.k===it.id?' recien':'')+'">'+
        '<div class="cgr-fila">'+
          '<div class="cgr-foto'+(V.modo==='vista'?' pt-click':'')+'"'+(V.modo==='vista'?' data-pt="foto" data-k="'+esc(it.id)+'"':'')+'>'+
            (it.foto?'<img src="'+esc(it.foto)+'" alt="">':'<i>'+x.cat.ico+'</i>')+'</div>'+
          '<div class="cgr-info"><div class="cgr-nom">'+esc(it.nombre)+'</div>'+
            '<div class="cgr-quedan">'+(x.quedan===0?'<b class="cero">No queda ninguno</b>':'Quedan <b>'+cant(x.quedan)+'</b>')+'</div>'+
            (num(it.sugerido)?'<div class="cgr-sub">Se vende a <b>'+peso(num(it.sugerido))+'</b></div>':'')+
            (num(it.precio)?'<div class="cgr-sub">A Chulengo: '+peso(num(it.precio))+'</div>':'')+'</div>'+
        '</div>'+
        '<button type="button" class="cgr-vendi" data-pt="vendi" data-k="'+esc(it.id)+'"'+(x.quedan===0?' disabled':'')+'>'+(x.quedan===0?'Sin stock':'✓ VENDÍ 1')+'</button>'+
        (x.sinCob>0?'<div class="cgr-vend"><span>Sin pagar: <b>'+cant(x.sinCob)+'</b><br><span style="white-space:nowrap">'+peso(x.sinCob*num(it.precio))+'</span></span><button type="button" class="cgr-menos" data-pt="menos" data-k="'+esc(it.id)+'">↩ Me equivoqué</button></div>':'')+
      '</div>';
    });
    if(!lista.length) h+='<div class="cgr-vacio">Todavía no hay productos cargados.</div>';
    else if(!vis.length) h+='<div class="cgr-vacio">No encontré ningún producto con ese nombre.</div>';
    h+='</div>';

    // Lo anotado sin pagar
    var pend = lista.filter(function(x){ return x.sinCob>0; });
    if(pend.length){
      h+='<div class="pt-pend"><button type="button" class="pt-pend-t" data-pt="ver-pend">📋 Lo que anotaste y falta pagar <span>'+(V.verPend?'▴':'▾')+'</span></button>';
      if(V.verPend){
        pend.forEach(function(x){ h+='<div class="pt-pend-f"><span>'+cant(x.sinCob)+' × '+esc(x.it.nombre)+'</span><b>'+peso(x.sinCob*num(x.it.precio))+'</b></div>'; });
        h+='<div class="pt-pend-f tot"><span>Total</span><b>'+peso(r.tot.m)+'</b></div>';
      }
      h+='</div>';
    }
    h+='<button type="button" class="pt-secund" data-pt="excel">⬇ Descargar la lista en Excel</button>';
    if(V.modo==='cliente') h+='<button type="button" class="cgr-reset" data-pt="salir-cuenta">Cerrar sesión</button>';
    h+='</div>';
    if(V.toast) h+='<div class="cgr-toast">'+esc(V.toast.txt)+'</div>';
    return h;
  }

  function pintarOverlay(){
    var ov=$('pt-overlay'); if(!ov) return;
    var act=document.activeElement, enBuscar = act && act.id==='pt-buscar', pos = enBuscar ? act.selectionStart : 0;
    ov.innerHTML = htmlOverlay();
    if(enBuscar){ var nb=$('pt-buscar'); if(nb){ nb.focus(); try{ nb.setSelectionRange(pos,pos); }catch(_){} } }
  }

  function mostrarToast(k, txt){
    var marca={k:k, txt:txt}; V.toast=marca;
    try{ if(navigator.vibrate) navigator.vibrate(35); }catch(_){}
    setTimeout(function(){ if(V.toast===marca){ V.toast=null; pintarOverlay(); } }, 2600);
  }

  function anotar(it, c){
    var v = { k:it.id, nombre:it.nombre, precio:num(it.precio), cant:c, email:emailAct(), cobrada:false };
    if(V.modo==='vista'){ v.fecha=new Date(); V.locales.push(v); pintarOverlay(); return; }
    v.fecha = FV().serverTimestamp();
    db().collection('consig_portal').doc(P.pid).collection('ventas').add(v)
      .catch(function(e){ alert('No se pudo anotar. Revisá que haya internet y tocá de nuevo.\n('+e.message+')'); });
  }

  function descargarExcel(){
    var r=resumen(V.locales), filas=[['Producto','Quedan','Vendidos sin pagar','Precio a Chulengo','A pagar']];
    items().filter(function(it){ return !it.oculto; }).forEach(function(it){
      var sc=Math.max(0,(r.por[it.id]||{}).sinCob||0);
      filas.push([it.nombre, quedanDe(it,r), sc, num(it.precio), sc*num(it.precio)]);
    });
    filas.push(['TOTAL','',r.tot.u,'',r.tot.m]);
    var csv='﻿'+filas.map(function(f){ return f.map(function(c){ c=String(c); return /[;"\n]/.test(c)?'"'+c.replace(/"/g,'""')+'"':c; }).join(';'); }).join('\r\n');
    var d=new Date(), a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    a.download='Chulengo - '+((P.doc&&P.doc.titulo)||'stock')+' - '+pad(d.getDate())+'-'+pad(d.getMonth()+1)+'-'+d.getFullYear()+'.csv';
    document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function loginGoogle(){
    var prov=new firebase.auth.GoogleAuthProvider();
    firebase.auth().signInWithPopup(prov).catch(function(e){
      if(/popup|operation-not-supported|web-storage/i.test((e&&e.code)||'')) firebase.auth().signInWithRedirect(prov);
      else if(!/cancelled|closed-by-user/i.test((e&&e.code)||'')) alert('No se pudo entrar: '+e.message);
    });
  }

  // ── Fotos (Fabri) ──
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
          if(JSON.stringify(items()).length>900000){ it.foto=antes||''; alert('No entran más fotos. Avisale a Claude.'); return; }
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

  // ═════════ Panel de Fabri ═════════
  var A = { cliente:null, abierto:null, pegar:false, texto:'', previa:null, ocultarResto:true, pendiente:false, verTodas:false };

  function itemsDesdeCatalogo(cliente){
    var c = U().calcular ? U().calcular(cliente) : {lista:[]};
    return c.lista.map(function(x){
      var st = x.enCliente!=null ? x.enCliente : x.sinCobrar;
      return { id:nuevoId(), catId:x.p.id, nombre:x.p.nombre, precio:num(x.precio), sugerido:num(x.p.sugerido), foto:x.p.foto||'', entregadas:Math.max(0,st), oculto: st<=0 };
    });
  }
  function delCatalogo(cliente, nombre){
    if(!U().catalogo) return null;
    var cat=U().catalogo(cliente);
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
    var filas=parsearLista(A.texto), its=items();
    return filas.map(function(f){
      var n=norm(f.nombre), ex=its.find(function(it){ return norm(it.nombre)===n; });
      return { f:f, ex:ex||null, cat: ex?null:delCatalogo(A.cliente, f.nombre) };
    });
  }

  function renderAdmin(cliente){
    A.cliente=cliente; var pid=slug(cliente); suscribir(pid);
    var h='<div class="cg pt-adm"><div class="rem-ficha-top"><button type="button" class="rem-back">← Volver</button></div>'+
      '<div class="cg-tit"><div class="cg-h1">📱 Página en vivo · '+esc(cliente)+'</div><div class="rem-gris">Lo que ve y marca el cliente desde su celular. Se actualiza solo.</div></div>';
    if(P.err) return h+'<div class="cg-bloque pt-error">'+(errPermiso(P.err)?'<b>Falta pegar las reglas nuevas en Firebase.</b> Sin eso la página del cliente no puede guardar ni leer nada.':'Error: '+esc(P.err.message))+'</div></div>';
    if(P.cargando) return h+'<div class="cg-bloque">Cargando…</div></div>';
    if(!P.doc){
      var n = U().catalogo ? U().catalogo(cliente).length : 0;
      return h+'<div class="cg-bloque"><div class="cg-bt">Todavía no creaste la página de este cliente</div>'+
        '<div class="rem-gris" style="margin-bottom:10px">Podés arrancar con los productos de tu catálogo, o vacía y después pegás la lista del Excel con lo que hay contado.</div>'+
        '<div class="cg-acc">'+(n?'<button type="button" class="cg-btn verde" data-pt="crear" data-desde="catalogo">Crear con mi catálogo ('+n+' productos)</button>':'')+
        '<button type="button" class="cg-btn'+(n?'':' verde')+'" data-pt="crear" data-desde="vacia">Crear vacía</button></div></div></div>';
    }
    var r=resumen(), its=items(), totQ=0;
    its.forEach(function(it){ if(!it.oculto) totQ+=quedanDe(it,r); });

    h+='<div class="cg-bloque pt-link"><div style="min-width:0;flex:1"><div class="cg-sub" style="margin-top:0">Link para el cliente</div><div class="pt-url">'+esc(URL_CLIENTE)+'</div></div>'+
      '<div class="cg-acc" style="margin:0"><button type="button" class="cg-btn" data-pt="copiar">Copiar link</button><button type="button" class="cg-btn" data-pt="ver">👀 Ver como el cliente</button></div></div>';

    h+='<div class="cg-kpis">'+
      '<div class="cg-kpi"><span>Vendido sin cobrar</span><b style="color:#B91C1C">'+peso(r.tot.m)+'</b><small class="rem-gris" style="display:block">'+cant(r.tot.u)+' u.</small></div>'+
      '<div class="cg-kpi"><span>Quedan en el lugar</span><b>'+cant(totQ)+' u.</b></div>'+
      '<div class="cg-kpi"><span>Productos visibles</span><b>'+its.filter(function(it){return !it.oculto;}).length+'</b></div>'+
    '</div>';
    if(r.tot.u>0) h+='<button type="button" class="cg-btn verde pt-cobrar" data-pt="cobrar">💰 Me pagó '+peso(r.tot.m)+' → marcar como cobrado</button>';

    // Acceso
    var em=(P.doc.emails||[]);
    h+='<div class="cg-bloque"><div class="cg-bt">👤 Quién puede entrar</div>'+
      (em.length?'<div class="cg-chips" style="margin-bottom:8px">'+em.map(function(e){ return '<span class="cg-chip">'+esc(e)+' <button type="button" data-pt="quitar-mail" data-mail="'+esc(e)+'">×</button></span>'; }).join('')+'</div>'
               :'<div class="rem-gris" style="margin-bottom:8px">Nadie todavía. Agregá el Gmail de Rubén.</div>')+
      '<div style="display:flex;gap:6px"><input id="pt-mail" class="cg-in" type="email" placeholder="gmail del cliente (ej: ruben@gmail.com)"><button type="button" class="cg-btn verde" data-pt="agregar-mail">Agregar</button></div>'+
      '<div class="cg-sub">Nombre que ve el cliente</div><input class="cg-in" data-pt-campo="titulo" value="'+esc(P.doc.titulo||'')+'" placeholder="Ej: el Candy">'+
    '</div>';

    // Productos
    h+='<div class="cg-bloque"><div class="cg-bt" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><span>Productos ('+its.length+')</span>'+
      '<span style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="cg-btn" data-pt="pegar">📋 Pegar lista del Excel</button><button type="button" class="cg-btn" data-pt="nuevo">+ Producto</button></span></div>';
    if(A.pegar){
      h+='<div class="pt-pegar"><div class="rem-gris">Copiá en el Excel las columnas de <b>producto</b> y <b>cantidad</b> (y precio si está) y pegalas acá. También sirve escribir una por renglón: <i>12 vaso Hulk</i>.</div>'+
        '<textarea id="pt-texto" class="cg-in" rows="7" placeholder="Vaso Hulk&#9;12&#10;Pochoclera Spider-Man&#9;4">'+esc(A.texto)+'</textarea>'+
        '<div class="cg-acc"><button type="button" class="cg-btn" data-pt="revisar">Revisar</button><button type="button" class="cg-btn" data-pt="pegar-cerrar">Cancelar</button></div>';
      if(A.previa){
        if(!A.previa.length) h+='<div class="pt-error">No encontré renglones con nombre y cantidad.</div>';
        else {
          h+='<div class="pt-previa">'+A.previa.map(function(x){
            return '<div><span>'+esc(x.f.nombre)+'</span><b>'+cant(x.f.cant)+' u.'+(x.f.precio?' · '+peso(x.f.precio):'')+'</b><i class="cg-tag '+(x.ex?'azul">actualiza':'rojo">nuevo'+(x.cat?' (del catálogo)':''))+'</i></div>';
          }).join('')+'</div>'+
          '<label class="pt-check"><input type="checkbox" id="pt-ocultar" '+(A.ocultarResto?'checked':'')+'> Ocultar al cliente los productos que no están en esta lista</label>'+
          '<button type="button" class="cg-btn verde" data-pt="cargar">Cargar '+A.previa.length+' productos con estas cantidades</button>';
        }
      }
      h+='</div>';
    }
    if(!its.length) h+='<div class="cg-vacio">No hay productos. Pegá la lista del Excel o agregalos de a uno.</div>';
    its.slice().sort(function(a,b){ return (a.oculto?1:0)-(b.oculto?1:0) || a.nombre.localeCompare(b.nombre); }).forEach(function(it){
      var x=r.por[it.id]||{vend:0,sinCob:0}, ab=A.abierto===it.id, qd=quedanDe(it,r);
      h+='<div class="pt-item'+(ab?' abierto':'')+(it.oculto?' oculto':'')+'">'+
        '<div class="pt-row" data-pt="abrir" data-k="'+esc(it.id)+'">'+
          (it.foto?'<img src="'+esc(it.foto)+'" alt="">':'<span class="pt-ico">'+catDe(it.nombre).ico+'</span>')+
          '<div class="pt-n"><div>'+esc(it.nombre)+(it.oculto?' <i class="cg-tag">oculto</i>':'')+'</div><div class="rem-gris">'+(num(it.precio)?peso(num(it.precio)):'sin precio')+(num(it.sugerido)?' · venta '+peso(num(it.sugerido)):'')+'</div></div>'+
          '<div class="pt-nums"><b>'+cant(qd)+'</b><span>quedan</span></div>'+
          '<div class="pt-nums">'+(x.sinCob>0?'<b style="color:#B91C1C">'+cant(x.sinCob)+'</b>':'<b>0</b>')+'<span>sin cobrar</span></div>'+
        '</div>';
      if(ab){
        h+='<div class="cg-edit"><div class="cg-grid">'+
          '<label>Nombre<input class="cg-in" data-pt-it="nombre" data-k="'+it.id+'" value="'+esc(it.nombre)+'"></label>'+
          '<label>Precio a Chulengo<input class="cg-in" inputmode="numeric" data-pt-it="precio" data-k="'+it.id+'" value="'+esc(it.precio||'')+'"></label>'+
          '<label>Venta al público<input class="cg-in" inputmode="numeric" data-pt-it="sugerido" data-k="'+it.id+'" value="'+esc(it.sugerido||'')+'"></label>'+
          '<label>Hay hoy (contado)<input class="cg-in" inputmode="numeric" data-pt-it="contado" data-k="'+it.id+'" placeholder="'+cant(qd)+'"></label>'+
          '<label>Llevé más (reponer)<input class="cg-in" inputmode="numeric" data-pt-it="reponer" data-k="'+it.id+'" placeholder="+0"></label>'+
          '<label>Vendidas en total<input class="cg-in" disabled value="'+cant(x.vend)+'"></label>'+
        '</div>'+
        '<div class="cg-fotofila" style="margin-top:10px">'+(it.foto?'<img src="'+esc(it.foto)+'" alt="">':'<span class="cg-sinfoto">'+catDe(it.nombre).ico+'</span>')+
          '<button type="button" class="cg-btn" data-pt="foto-adm" data-k="'+it.id+'">📷 '+(it.foto?'Cambiar foto':'Poner foto')+'</button>'+
          (it.foto?'<button type="button" class="cg-btn rojo" data-pt="foto-quitar" data-k="'+it.id+'">Quitar foto</button>':'')+'</div>'+
        '<div class="cg-acc"><button type="button" class="cg-btn" data-pt="ocultar" data-k="'+it.id+'">'+(it.oculto?'👁 Mostrar al cliente':'🙈 Ocultar al cliente')+'</button>'+
          (x.vend===0&&!P.ventas.some(function(v){return v.k===it.id;})?'<button type="button" class="cg-btn rojo" data-pt="borrar" data-k="'+it.id+'">Borrar</button>':'')+'</div></div>';
      }
      h+='</div>';
    });
    h+='</div>';

    // Ventas
    var vs=P.ventas.slice().sort(function(a,b){ return fechaDe(b)-fechaDe(a); });
    if(vs.length){
      var mostrar = A.verTodas ? vs : vs.slice(0,30);
      h+='<div class="cg-bloque"><div class="cg-bt">🧾 Últimos movimientos</div>'+mostrar.map(function(v){
        return '<div class="pt-venta'+(v.cobrada?' cob':'')+'"><span>'+fechaTxt(fechaDe(v))+'</span><span class="pt-vn">'+(num(v.cant)<0?'↩ Corrigió: ':'')+esc(v.nombre)+'</span><span>'+(num(v.cant)>0?'+':'')+cant(num(v.cant))+'</span><span>'+(v.cobrada?'cobrado':'<b>sin cobrar</b>')+'</span></div>';
      }).join('')+(vs.length>30&&!A.verTodas?'<button type="button" class="cg-btn" style="margin-top:8px" data-pt="ver-todas">Ver los '+vs.length+'</button>':'')+'</div>';
    }
    return h+'</div>';
  }

  // ── Clicks ──
  document.addEventListener('click', function(e){
    var b=e.target.closest('[data-pt]'); if(!b) return;
    var acc=b.dataset.pt, k=b.dataset.k, it=k?items().find(function(x){ return x.id===k; }):null;

    // pantalla del cliente
    if(acc==='login'){ loginGoogle(); return; }
    if(acc==='salir-cuenta'){ if(V.modo==='cliente' && !confirm('¿Cerrar sesión? Para volver a entrar vas a tener que poner tu cuenta de Google.')) return; firebase.auth().signOut(); return; }
    if(acc==='cerrar'){ cerrarOverlay(); if(location.hash==='#candy') history.replaceState(null,'',location.pathname+location.search); return; }
    if(acc==='recargar'){ location.reload(); return; }
    if(acc==='cat'){ V.cat=b.dataset.cat||''; pintarOverlay(); var ov=$('pt-overlay'); if(ov) ov.scrollTop=0; return; }
    if(acc==='ver-pend'){ V.verPend=!V.verPend; pintarOverlay(); return; }
    if(acc==='excel'){ descargarExcel(); return; }
    if(acc==='vendi'){
      if(!it) return; var ahora=Date.now();
      if(ahora-(V.ultimoToque[k]||0)<700) return; V.ultimoToque[k]=ahora;
      if(quedanDe(it, resumen(V.locales))<=0) return;
      anotar(it, 1); mostrarToast(k, '✓ Anotado: 1 '+it.nombre); pintarOverlay(); return;
    }
    if(acc==='menos'){
      if(!it) return; var rr=resumen(V.locales);
      if(((rr.por[k]||{}).sinCob||0)<=0) return;
      anotar(it, -1); mostrarToast(null, '↩ Listo, se descontó 1 '+it.nombre); pintarOverlay(); return;
    }
    if(acc==='foto'){ if(V.modo==='vista' && esEquipo()) pedirFoto(k); return; }

    // panel de Fabri
    if(acc==='abrir-adm'){ A.abierto=null; A.pegar=false; A.previa=null; remIr({tipo:'portal', cliente:b.dataset.cliente}); return; }
    if(!b.closest('.pt-adm')) return;
    var cliente=A.cliente;
    if(acc==='crear'){
      var its = b.dataset.desde==='catalogo' ? itemsDesdeCatalogo(cliente) : [];
      b.disabled=true; b.textContent='Creando…';
      db().collection('consig_portal').doc(slug(cliente)).set({ cliente:cliente, titulo:tituloDe(cliente), emails:[], items:its, equipo:'chulengo', creado:FV().serverTimestamp(), actualizado:FV().serverTimestamp() })
        .catch(function(e){ alert('No se pudo crear: '+e.message); renderHistorialRemitos(); });
      return;
    }
    if(acc==='copiar'){
      var hecho=function(){ b.textContent='✓ Copiado'; setTimeout(function(){ b.textContent='Copiar link'; },1500); };
      if(navigator.clipboard) navigator.clipboard.writeText(URL_CLIENTE).then(hecho, function(){ prompt('Copiá el link:', URL_CLIENTE); });
      else prompt('Copiá el link:', URL_CLIENTE);
      return;
    }
    if(acc==='ver'){ abrirOverlay('vista'); return; }
    if(acc==='cobrar'){
      var r=resumen(), pend=P.ventas.filter(function(v){ return !v.cobrada; });
      if(!confirm('¿Te pagaron '+peso(r.tot.m)+' por '+cant(r.tot.u)+' productos?\n\nSe marcan como cobrados y el total del cliente vuelve a $ 0. Lo que queda en el lugar no cambia.')) return;
      b.disabled=true; b.textContent='Guardando…';
      var ref=db().collection('consig_portal').doc(P.pid).collection('ventas'), ps=[];
      for(var i=0;i<pend.length;i+=400){
        var bt=db().batch();
        pend.slice(i,i+400).forEach(function(v){ bt.update(ref.doc(v.id), { cobrada:true, cobradaEn:FV().serverTimestamp(), cobradaPor:emailAct() }); });
        ps.push(bt.commit());
      }
      Promise.all(ps).catch(function(e){ alert('No se pudo guardar: '+e.message); renderHistorialRemitos(); });
      return;
    }
    if(acc==='agregar-mail'){
      var m=(($('pt-mail')||{}).value||'').trim().toLowerCase();
      if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m)){ alert('Escribí un correo válido, por ejemplo ruben@gmail.com'); return; }
      var bt2=db().batch();
      bt2.update(db().collection('consig_portal').doc(P.pid), { emails:FV().arrayUnion(m) });
      bt2.set(db().collection('consig_acceso').doc(m), { pid:P.pid, cliente:cliente });
      bt2.commit().catch(function(e){ alert('No se pudo agregar: '+e.message); });
      return;
    }
    if(acc==='quitar-mail'){
      var mm=b.dataset.mail; if(!confirm('¿Sacarle el acceso a '+mm+'?')) return;
      var bt3=db().batch();
      bt3.update(db().collection('consig_portal').doc(P.pid), { emails:FV().arrayRemove(mm) });
      bt3.delete(db().collection('consig_acceso').doc(mm));
      bt3.commit().catch(function(e){ alert('No se pudo quitar: '+e.message); });
      return;
    }
    if(acc==='pegar'){ A.pegar=!A.pegar; A.previa=null; renderHistorialRemitos(); return; }
    if(acc==='pegar-cerrar'){ A.pegar=false; A.previa=null; A.texto=''; renderHistorialRemitos(); return; }
    if(acc==='revisar'){ A.texto=(($('pt-texto')||{}).value)||''; A.previa=previaLista(); renderHistorialRemitos(); return; }
    if(acc==='cargar'){
      var ocultar=!!(($('pt-ocultar')||{}).checked), lista=items(), tocados={};
      (A.previa||[]).forEach(function(x){
        var f=x.f, ex=lista.find(function(y){ return norm(y.nombre)===norm(f.nombre); });
        if(ex){ ex.entregadas = f.cant + vendidasDe(ex.id); if(f.precio) ex.precio=f.precio; ex.oculto=false; tocados[ex.id]=1; }
        else {
          var c=x.cat||{}, nu={ id:nuevoId(), nombre:(c.nombre||f.nombre), precio:f.precio||num(c.precio), sugerido:num(c.sugerido), foto:c.foto||'', entregadas:f.cant, oculto:false };
          if(c.id) nu.catId=c.id;
          var dup=lista.find(function(y){ return norm(y.nombre)===norm(nu.nombre); });
          if(dup){ dup.entregadas=f.cant+vendidasDe(dup.id); if(f.precio) dup.precio=f.precio; dup.oculto=false; tocados[dup.id]=1; }
          else { lista.push(nu); tocados[nu.id]=1; }
        }
      });
      if(ocultar) lista.forEach(function(y){ if(!tocados[y.id]) y.oculto=true; });
      if(P.doc) P.doc.items=lista;
      A.pegar=false; A.previa=null; A.texto='';
      guardarItems(); return;
    }
    if(acc==='nuevo'){
      var nom=(prompt('Nombre del producto:')||'').trim(); if(!nom) return;
      var c2=delCatalogo(cliente, nom)||{};
      var nu2={ id:nuevoId(), nombre:nom, precio:num(c2.precio), sugerido:num(c2.sugerido), foto:c2.foto||'', entregadas:0, oculto:false };
      items().push(nu2); A.abierto=nu2.id; guardarItems(); return;
    }
    if(acc==='abrir'){ A.abierto = A.abierto===k ? null : k; renderHistorialRemitos(); return; }
    if(acc==='foto-adm'){ pedirFoto(k); return; }
    if(acc==='foto-quitar'){ if(it){ it.foto=''; guardarItems(); } return; }
    if(acc==='ocultar'){ if(it){ it.oculto=!it.oculto; guardarItems(); } return; }
    if(acc==='borrar'){ if(it && confirm('¿Borrar "'+it.nombre+'"?')){ var l=items(); l.splice(l.indexOf(it),1); A.abierto=null; guardarItems(); } return; }
    if(acc==='ver-todas'){ A.verTodas=true; renderHistorialRemitos(); return; }
  });

  document.addEventListener('change', function(e){
    var t=e.target;
    if(t.id==='pt-ocultar'){ A.ocultarResto=t.checked; return; }
    if(!t.closest || !t.closest('.pt-adm')) return;
    if(t.dataset.ptCampo==='titulo'){ var v=t.value.trim(); if(P.pid) db().collection('consig_portal').doc(P.pid).update({titulo:v}).catch(function(err){ alert(err.message); }); return; }
    var campo=t.dataset.ptIt; if(!campo) return;
    var it=items().find(function(x){ return x.id===t.dataset.k; }); if(!it) return;
    var val=t.value.trim();
    if(campo==='nombre'){ if(!val){ t.value=it.nombre; return; } it.nombre=val; }
    else if(campo==='precio' || campo==='sugerido'){ it[campo]= val==='' ? 0 : num(val); }
    else if(campo==='contado'){ if(val==='') return; it.entregadas = num(val) + vendidasDe(it.id); }
    else if(campo==='reponer'){ if(val==='') return; it.entregadas = num(it.entregadas) + num(val); }
    guardarItems();
  });
  document.addEventListener('input', function(e){
    if(e.target.id==='pt-buscar'){ V.filtro=e.target.value; pintarOverlay(); }
    else if(e.target.id==='pt-texto'){ A.texto=e.target.value; }
  });
  document.addEventListener('focusout', function(e){
    if(A.pendiente && e.target.closest && e.target.closest('.pt-adm')){ A.pendiente=false; setTimeout(avisar, 50); }
  });

  // ── Quién entra ──
  function alCambiarUsuario(u){
    var quiere = /^#candy/i.test(location.hash||'');
    if(!u){
      if(V.modo==='cliente' || V.modo==='sinAcceso' || quiere){ desuscribir(); abrirOverlay('login'); }
      return;
    }
    var em=(u.email||'').toLowerCase();
    db().collection('consig_acceso').doc(em).get().then(function(s){
      if(s.exists && s.data().pid && (!esAdm() || quiere)){ suscribir(s.data().pid); abrirOverlay('cliente'); }
      else if(quiere && !esAdm()) abrirOverlay('sinAcceso');
      else if(V.modo==='login') cerrarOverlay();
    }).catch(function(){
      if(quiere && !esAdm()) abrirOverlay('sinAcceso'); else if(V.modo==='login') cerrarOverlay();
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
    try{ firebase.auth().onAuthStateChanged(alCambiarUsuario); }catch(_){}
    if(/^#candy/i.test(location.hash||'') && !(firebase.auth().currentUser)) setTimeout(function(){ if(!firebase.auth().currentUser && !V.modo) abrirOverlay('login'); }, 1500);

    var st=document.createElement('style');
    st.textContent=
      'body.pt-abierto{overflow:hidden}'+
      '.pt-acceso{display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;border-color:#A7F3D0!important;background:#F0FDF7!important}.pt-acceso:hover{background:#DCFCEC!important}'+
      '.pt-centro{text-align:center;padding-top:40px}.pt-centro .cgr-head{justify-content:center;text-align:left;margin-bottom:24px}'+
      '.pt-txt{font-size:1.05em;color:#3F3A33;margin:0 0 18px}.pt-chico{font-size:0.85em;color:#6B665E;margin-top:16px}'+
      '.pt-google{display:block;width:100%;max-width:420px;margin:0 auto;height:70px;border:none;border-radius:16px;background:#1A1814;color:#fff;font-size:1.3em;font-weight:800;cursor:pointer}'+
      '.pt-secund{display:block;width:100%;margin:14px auto 0;max-width:620px;height:58px;border:2px solid #D9D3C9;border-radius:14px;background:#fff;color:#1A1814;font-size:1em;font-weight:700;cursor:pointer}'+
      '.pt-pend{background:#fff;border:1px solid #DDD7CD;border-radius:16px;margin-top:6px;overflow:hidden}'+
      '.pt-pend-t{display:flex;justify-content:space-between;align-items:center;width:100%;border:none;background:none;padding:16px;font-size:1em;font-weight:700;color:#1A1814;cursor:pointer;text-align:left}'+
      '.pt-pend-f{display:flex;justify-content:space-between;gap:10px;padding:10px 16px;border-top:1px solid #F0ECE6;font-size:0.95em}.pt-pend-f.tot{background:#F5F2ED;font-weight:800}'+
      '.cgr-foto.pt-click{cursor:pointer}div.cgr-foto{cursor:default}'+
      '.pt-link{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.pt-link>div:first-child{flex:1 1 220px!important}.pt-url{font-size:0.85rem;font-weight:600;overflow-wrap:anywhere}'+
      '.pt-cobrar{width:100%;padding:13px;font-size:0.95rem;margin-bottom:12px}'+
      '.pt-error{background:#FEF2F2;color:#991B1B;border-color:#FECACA!important;padding:10px 12px;border-radius:10px;font-size:0.88rem}'+
      '.pt-item{border-bottom:1px solid #F0ECE6}.pt-item.abierto{background:#FAF8F5}.pt-item.oculto .pt-row{opacity:0.5}'+
      '.pt-row{display:flex;align-items:center;gap:10px;padding:8px 4px;cursor:pointer}'+
      '.pt-row img,.pt-ico{width:44px;height:44px;border-radius:9px;object-fit:cover;flex-shrink:0;background:#F5F2ED;display:flex;align-items:center;justify-content:center;font-size:1.4rem}'+
      '.pt-n{flex:1;min-width:0;font-weight:600;font-size:0.88rem}.pt-n .rem-gris{font-weight:400;font-size:0.76rem}'+
      '.pt-nums{text-align:center;min-width:58px}.pt-nums b{display:block;font-size:1rem}.pt-nums span{font-size:0.62rem;color:#8A8479;text-transform:uppercase;font-weight:700}'+
      '.pt-pegar{background:#F5F9FF;border:1px solid #BFDBFE;border-radius:10px;padding:10px;margin-bottom:10px;display:flex;flex-direction:column;gap:8px}.pt-pegar textarea{font-family:ui-monospace,monospace;font-size:0.8rem}'+
      '.pt-previa{max-height:260px;overflow:auto;background:#fff;border:1px solid #E2DDD6;border-radius:8px}.pt-previa div{display:flex;gap:8px;align-items:center;padding:6px 8px;border-bottom:1px solid #F0ECE6;font-size:0.82rem}.pt-previa span{flex:1;min-width:0}'+
      '.pt-check{display:flex;gap:6px;align-items:center;font-size:0.82rem}'+
      '.pt-venta{display:grid;grid-template-columns:80px minmax(0,1fr) 34px 80px;gap:8px;font-size:0.8rem;padding:5px 0;border-bottom:1px dashed #E2DDD6}.pt-venta.cob{color:#8A8479}.pt-vn{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
      'body.dark .pt-item.abierto{background:#222}';
    document.head.appendChild(st);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', enganchar); else enganchar();
})();
