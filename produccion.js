// ═══ Producción y ganancia del Candy (solo equipo Chulengo) ═══
// Costos, gramos y horas de impresión van en un documento privado que Rubén NO puede leer:
//   consig_portal/{pid}/privado/datos  { costos:{itemId:{costo,gramos,horas}}, cfg:{kg,hora,maquinas,horasDia}, tandas:[...] }
(function(){
  var C=function(){ return window.ptCore; };
  var MT=function(){ return window.ptMetricas; };
  var Q = { pid:null, doc:null, unsub:null, err:null, tanda:null, editTanda:false };

  function ref(){ return C().db().collection('consig_portal').doc(C().P.pid).collection('privado').doc('datos'); }
  function suscribir(){
    var c=C(); if(!c.P.pid) return;
    if(Q.pid===c.P.pid && Q.unsub) return;
    if(Q.unsub) Q.unsub();
    Q.pid=c.P.pid; Q.doc=null; Q.err=null;
    Q.unsub = ref().onSnapshot(function(s){ Q.doc = s.exists ? s.data() : {}; Q.err=null; repintar(); }, function(e){ Q.err=e; repintar(); });
  }
  function repintar(){ var c=C(); if(c && c.V.pantalla==='produccion' && document.getElementById('pt-overlay')){ var a=document.activeElement; if(a && /INPUT|SELECT/.test(a.tagName) && a.closest('#pt-overlay')) return; c.pintar(); } }
  function d(){ return Q.doc || {}; }
  function cfg(){ var x=d().cfg||{}; return { kg:+x.kg||0, hora:+x.hora||0, maquinas:+x.maquinas||3, horasDia:+x.horasDia||16 }; }
  function datosDe(id){ return (d().costos||{})[id] || {}; }
  function guardar(campos){ return ref().set(campos, {merge:true}).catch(function(e){ alert('No se pudo guardar: '+e.message); }); }

  // costo: el que cargaste > el del catálogo > estimado por filamento y horas
  function costoDe(it){
    var c=C(), x=datosDe(it.id), cf=cfg();
    if(c.num(x.costo)) return { v:c.num(x.costo), origen:'cargado' };
    var cat=c.delCatalogo && c.P.doc ? c.delCatalogo(c.P.doc.cliente, it.nombre) : null;
    if(cat && c.num(cat.costo)) return { v:c.num(cat.costo), origen:'catálogo' };
    var g=c.num(x.gramos), h=c.num(x.horas);
    if((g && cf.kg) || (h && cf.hora)) return { v:Math.round(g*cf.kg/1000 + h*cf.hora), origen:'estimado' };
    return { v:null, origen:'' };
  }

  function filas(){
    var c=C(), md=MT().datos(), sem={}; md.sem.forEach(function(x){ sem[x.it.id]=x; });
    var hoy=MT().hoyIso(), mes=hoy.slice(0,7), dA=new Date(); dA.setDate(1); dA.setMonth(dA.getMonth()-1); var mesAnt=MT().iso(dA).slice(0,7);
    return c.items().filter(function(it){ return !it.oculto; }).map(function(it){
      var x=datosDe(it.id), co=costoDe(it), pr=c.num(it.precio), s=sem[it.id]||{ritmo:0,hay:0,producir:0,est:'gris'};
      var gan = co.v!==null ? pr-co.v : null, h=c.num(x.horas);
      var um=0, ua=0; (md.D.porItem[it.id]||[]).forEach(function(v){ if(v[0].slice(0,7)===mes) um+=v[1]; if(v[0].slice(0,7)===mesAnt) ua+=v[1]; });
      return { it:it, x:x, costo:co, precio:pr, gan:gan, margen: gan!==null && pr ? gan/pr : null, horas:h, gramos:c.num(x.gramos),
        porHora: gan!==null && h ? gan/h : null, ritmo:s.ritmo, ganMes: gan!==null ? gan*s.ritmo*30 : null, hay:s.hay, producir:s.producir, est:s.est,
        um:um, ua:ua };
    });
  }

  function pendientes(){ var p={}; (d().tandas||[]).forEach(function(t){ if(t.estado==='entregada') return; t.lineas.forEach(function(l){ p[l.k]=(p[l.k]||0)+C().num(l.cant); }); }); return p; }
  function propuesta(F){
    var o={rojo:0,amarillo:1,verde:2,gris:3}, pend=pendientes();
    return F.map(function(f){ return Object.assign({}, f, { producir: Math.max(0, f.producir-(pend[f.it.id]||0)) }); }).filter(function(f){ return f.producir>0; }).sort(function(a,b){ return o[a.est]-o[b.est] || (b.porHora||0)-(a.porHora||0); })
      .map(function(f){ return { k:f.it.id, nombre:f.it.nombre, cant:f.producir }; });
  }

  function totales(lineas, F){
    var c=C(), por={}; F.forEach(function(f){ por[f.it.id]=f; });
    var t={u:0,h:0,g:0,costo:0,gan:0,sinDatos:0};
    lineas.forEach(function(l){ var f=por[l.k]; var n=c.num(l.cant); t.u+=n; if(!f) return;
      if(f.horas) t.h+=f.horas*n; else t.sinDatos++;
      t.g+=f.gramos*n; if(f.costo.v!==null){ t.costo+=f.costo.v*n; t.gan+=f.gan*n; } });
    var cf=cfg(); t.dias = t.h ? t.h/(cf.maquinas*cf.horasDia) : 0;
    return t;
  }

  function html(){
    var c=C(); suscribir();
    var h='<div class="cs-in"><div class="cs-titulo"><button type="button" class="cs-btn" data-pt="a-tabla">← Volver</button><h2>Producción y ganancia</h2></div>';
    if(Q.err) return h+'<div class="cs-card cs-msg"><p>No se pudieron leer tus costos: '+c.esc(Q.err.message)+'</p></div></div>';
    if(!Q.doc) return h+'<div class="cs-card cs-vacio">Cargando…</div></div>';
    var F=filas(), cf=cfg(), sinCosto=F.filter(function(f){ return f.costo.v===null; }).length, sinHoras=F.filter(function(f){ return !f.horas; }).length;
    var gm=0, ga=0, vm=0; F.forEach(function(f){ if(f.gan!==null){ gm+=f.gan*f.um; ga+=f.gan*f.ua; } vm+=f.precio*f.um; });
    var conMargen=F.filter(function(f){ return f.margen!==null && f.precio; }), mp=0; conMargen.forEach(function(f){ mp+=f.margen; }); mp = conMargen.length ? mp/conMargen.length : null;

    h+='<div class="cs-ok pr-priv">🔒 Esta pantalla y tus costos los ves solo vos y tu equipo. Rubén no tiene acceso.</div>';
    h+='<div class="cs-kpis mt-kpis">'+
      '<div class="cs-kpi destacado"><span>Ganancia este mes</span><b>'+c.peso(gm)+'</b><small>sobre '+c.peso(vm)+' vendidos</small></div>'+
      '<div class="cs-kpi"><span>Ganancia mes pasado</span><b>'+c.peso(ga)+'</b><small>&nbsp;</small></div>'+
      '<div class="cs-kpi"><span>Margen promedio</span><b>'+(mp===null?'—':Math.round(mp*100)+'%')+'</b><small>de lo que te paga Rubén</small></div>'+
      '<div class="cs-kpi"><span>Faltan datos</span><b>'+(sinCosto||sinHoras?'<span style="color:#B45309">'+sinCosto+' sin costo</span>':'Completo')+'</b><small>'+sinHoras+' sin horas de impresión</small></div>'+
    '</div>';

    // Config
    h+='<div class="cs-card"><div class="cs-card-h"><h3>Tus números</h3></div><div class="pr-cfg">'+
      '<label>Precio del kg de filamento<input class="cs-input" inputmode="numeric" data-pr-cfg="kg" value="'+(cf.kg||'')+'" placeholder="$ por kg"></label>'+
      '<label>Costo por hora de máquina<input class="cs-input" inputmode="numeric" data-pr-cfg="hora" value="'+(cf.hora||'')+'" placeholder="luz + desgaste"></label>'+
      '<label>Máquinas para el Candy<input class="cs-input" inputmode="numeric" data-pr-cfg="maquinas" value="'+cf.maquinas+'"></label>'+
      '<label>Horas por día que imprimen<input class="cs-input" inputmode="numeric" data-pr-cfg="horasDia" value="'+cf.horasDia+'"></label>'+
      '</div><div class="mt-nota">Con el kg y el costo por hora, si a un producto le cargás gramos y horas, la página estima el costo sola. Si cargás el costo a mano, usa ese.</div></div>';

    // Qué conviene imprimir
    var orden=F.slice().sort(function(a,b){ return (b.ganMes===null?-1:b.ganMes)-(a.ganMes===null?-1:a.ganMes) || (b.porHora||0)-(a.porHora||0); });
    h+='<div class="cs-card"><div class="cs-card-h"><h3>Qué conviene imprimir</h3><span class="cs-gris mt-ley">ordenado por lo que te deja por mes</span></div>'+
      '<div class="pr-scroll"><table class="cs-tabla pr-tabla"><thead><tr><th>Producto</th><th class="n">Te paga</th><th class="n">Costo</th><th class="n">Gramos</th><th class="n">Horas</th><th class="n">Ganás c/u</th><th class="n">Por hora de máquina</th><th class="n">Vende/sem</th><th class="n">Te deja por mes</th></tr></thead><tbody>';
    orden.forEach(function(f){
      var ph=c.num(f.x.costo)?'':(f.costo.v!==null?c.cant(f.costo.v):'');
      h+='<tr><td><b>'+c.esc(f.it.nombre)+'</b>'+(f.costo.origen&&f.costo.origen!=='cargado'?'<small class="blq">costo '+f.costo.origen+'</small>':'')+'</td>'+
        '<td class="n">'+c.peso(f.precio)+'</td>'+
        '<td class="n"><input class="mt-min pr-in" inputmode="numeric" data-pr-it="costo" data-k="'+f.it.id+'" value="'+(c.num(f.x.costo)||'')+'" placeholder="'+(ph||'$')+'"></td>'+
        '<td class="n"><input class="mt-min pr-in" inputmode="numeric" data-pr-it="gramos" data-k="'+f.it.id+'" value="'+(f.gramos||'')+'" placeholder="g"></td>'+
        '<td class="n"><input class="mt-min pr-in" inputmode="decimal" data-pr-it="horas" data-k="'+f.it.id+'" value="'+(f.horas||'')+'" placeholder="h"></td>'+
        '<td class="n">'+(f.gan===null?'<span class="cs-gris">—</span>':'<b'+(f.gan<0?' style="color:#B91C1C"':'')+'>'+c.peso(f.gan)+'</b><small class="blq">'+Math.round(f.margen*100)+'%</small>')+'</td>'+
        '<td class="n">'+(f.porHora===null?'<span class="cs-gris">—</span>':c.peso(Math.round(f.porHora/10)*10)+'/h')+'</td>'+
        '<td class="n">'+(f.ritmo>0?c.cant(Math.round(f.ritmo*7*10)/10):'<span class="cs-gris">—</span>')+'</td>'+
        '<td class="n">'+(f.ganMes===null||!f.ritmo?'<span class="cs-gris">—</span>':'<b>'+c.peso(Math.round(f.ganMes/10)*10)+'</b>')+'</td></tr>';
    });
    h+='</tbody></table></div><div class="mt-nota"><b>Por hora de máquina</b> = lo que ganás con una unidad dividido las horas que tarda en imprimirse: sirve para elegir qué poner primero cuando las máquinas están ocupadas. <b>Te deja por mes</b> = ganancia por unidad × lo que se vende (últimas 4 semanas).</div></div>';

    // Tanda de impresión
    if(!Q.tanda) Q.tanda = propuesta(F);
    var t=totales(Q.tanda, F);
    h+='<div class="cs-card"><div class="cs-card-h"><h3>🖨️ Próxima tanda de impresión</h3><span><button type="button" class="cs-btn ghost" data-pr="recalcular">Volver a sugerir</button></span></div>';
    if(!Q.tanda.length) h+='<div class="cs-vacio">'+(Q.guardada?'✓ Tanda guardada (abajo, en "Tandas en marcha"). ':'')+'No hay nada más para reponer según los mínimos. Cargá mínimos en Métricas o agregá productos a mano.</div>';
    else {
      h+='<table class="cs-tabla"><thead><tr><th>Producto</th><th class="n">Cantidad</th><th class="n">Horas</th><th class="n">Filamento</th><th></th></tr></thead><tbody>';
      var por={}; F.forEach(function(f){ por[f.it.id]=f; });
      Q.tanda.forEach(function(l,i){ var f=por[l.k]||{}; var n=c.num(l.cant);
        h+='<tr><td><span class="mt-dot '+(f.est||'gris')+'" style="display:inline-block;margin-right:8px;vertical-align:middle"></span><b>'+c.esc(l.nombre)+'</b></td>'+
          '<td class="n"><input class="mt-min" inputmode="numeric" data-pr-cant="'+i+'" value="'+n+'"></td>'+
          '<td class="n">'+(f.horas?c.cant(Math.round(f.horas*n*10)/10)+' h':'<span class="cs-gris">sin dato</span>')+'</td>'+
          '<td class="n">'+(f.gramos?c.cant(Math.round(f.gramos*n))+' g':'<span class="cs-gris">—</span>')+'</td>'+
          '<td class="n"><button type="button" class="cs-link" data-pr="quitar" data-i="'+i+'">Quitar</button></td></tr>'; });
      h+='</tbody></table>';
    }
    var noEn=C().items().filter(function(it){ return !it.oculto && !Q.tanda.some(function(l){ return l.k===it.id; }); });
    h+='<div class="pr-add"><select id="pr-add-sel" class="cs-input"><option value="">+ Agregar producto a la tanda…</option>'+noEn.map(function(it){ return '<option value="'+it.id+'">'+c.esc(it.nombre)+'</option>'; }).join('')+'</select></div>';
    h+='<div class="pr-tot">'+
      '<div><span>Unidades</span><b>'+c.cant(t.u)+'</b></div>'+
      '<div><span>Horas de máquina</span><b>'+c.cant(Math.round(t.h*10)/10)+' h</b></div>'+
      '<div><span>Con '+cf.maquinas+' máquinas</span><b>'+(t.h?(t.dias<1?'menos de 1 día':'≈ '+c.cant(Math.ceil(t.dias*10)/10)+' días'):'—')+'</b></div>'+
      '<div><span>Filamento</span><b>'+(t.g?c.cant(Math.round(t.g/100)/10)+' kg':'—')+'</b></div>'+
      '<div><span>Costo</span><b>'+c.peso(t.costo)+'</b></div>'+
      '<div><span>Ganancia al venderse</span><b>'+c.peso(t.gan)+'</b></div>'+
    '</div>'+(t.sinDatos?'<div class="mt-nota">⚠️ '+t.sinDatos+' producto(s) sin horas de impresión: el tiempo total da de menos. Cargalas en la tabla de arriba.</div>':'')+
    '<div class="cs-acciones" style="padding:0 16px 16px;margin:0"><button type="button" class="cs-btn primario" data-pr="guardar-tanda"'+(Q.tanda.length?'':' disabled')+'>Guardar tanda y empezar</button>'+
      '<button type="button" class="cs-btn" data-pr="copiar"'+(Q.tanda.length?'':' disabled')+'>📋 Copiar para WhatsApp</button></div></div>';

    // Tandas guardadas
    var tandas=(d().tandas||[]).slice().sort(function(a,b){ return b.fecha-a.fecha; });
    if(tandas.length){
      h+='<div class="cs-card"><div class="cs-card-h"><h3>Tandas en marcha</h3></div>';
      tandas.filter(function(x){ return x.estado!=='entregada' || Date.now()-x.fecha<14*864e5; }).slice(0,6).forEach(function(td){
        var tot=0, hechos=0; td.lineas.forEach(function(l){ tot+=c.num(l.cant); hechos+=Math.min(c.num(l.hechos),c.num(l.cant)); });
        var pct = tot ? Math.round(hechos/tot*100) : 0, lista=td.estado==='lista'||td.estado==='entregada';
        h+='<div class="pr-tanda'+(lista?' lista':'')+'"><div class="pr-tanda-h"><div><b>Tanda del '+new Date(td.fecha).toLocaleDateString('es-AR')+'</b><small>'+hechos+' de '+tot+' impresos'+(td.estado==='lista'?' · lista para llevar':td.estado==='entregada'?' · entregada':'')+'</small></div>'+
          '<div class="pr-bar"><i style="width:'+pct+'%"></i></div>'+
          '<span>'+(td.estado==='entregada'?'<span class="cs-tag gris">Entregada</span>':lista?'<button type="button" class="cs-btn primario" data-pr="entregada" data-id="'+td.id+'">Ya la llevé al cine</button>':'<button type="button" class="cs-btn" data-pr="lista" data-id="'+td.id+'">Marcar lista</button>')+' <button type="button" class="cs-link" data-pr="borrar-tanda" data-id="'+td.id+'">Borrar</button></span></div>';
        if(!lista) h+='<div class="pr-lineas">'+td.lineas.map(function(l,i){ return '<label><span>'+c.esc(l.nombre)+'</span><input class="mt-min" inputmode="numeric" data-pr-hecho="'+td.id+'|'+i+'" value="'+(c.num(l.hechos)||'')+'" placeholder="0"> / '+c.num(l.cant)+'</label>'; }).join('')+'</div>';
        h+='</div>';
      });
      h+='<div class="mt-nota">Cuando la tanda esté lista y la lleves al cine, hacé el remito y tocá <b>Dar de alta un remito</b> para sumarla al stock.</div></div>';
    }
    return h+'</div>';
  }

  function textoWhatsApp(F){
    var c=C(), t=totales(Q.tanda,F), cf=cfg();
    return '*Tanda de impresión – Candy*\n\n'+Q.tanda.map(function(l){ return '• '+c.num(l.cant)+' × '+l.nombre; }).join('\n')+
      '\n\nTotal: '+t.u+' unidades'+(t.h?' · '+(Math.round(t.h*10)/10)+' h de máquina (≈ '+(Math.ceil(t.dias*10)/10)+' días con '+cf.maquinas+' máquinas)':'')+(t.g?' · '+(Math.round(t.g/100)/10)+' kg de filamento':'');
  }

  document.addEventListener('click', function(e){
    var b=e.target.closest('[data-pr]'); if(!b) return;
    var c=C(), acc=b.dataset.pr;
    if(acc==='recalcular'){ Q.tanda=null; Q.guardada=false; c.pintar(); return; }
    if(acc==='quitar'){ Q.tanda.splice(+b.dataset.i,1); c.pintar(); return; }
    if(acc==='copiar'){
      var txt=textoWhatsApp(filas());
      var ok=function(){ b.textContent='✓ Copiado'; setTimeout(function(){ b.textContent='📋 Copiar para WhatsApp'; },1500); };
      if(navigator.clipboard) navigator.clipboard.writeText(txt).then(ok,function(){ prompt('Copiá el texto:',txt); }); else prompt('Copiá el texto:',txt);
      return;
    }
    if(acc==='guardar-tanda'){
      var lineas=Q.tanda.filter(function(l){ return c.num(l.cant)>0; }).map(function(l){ return { k:l.k, nombre:l.nombre, cant:c.num(l.cant), hechos:0 }; });
      if(!lineas.length) return;
      var td={ id:c.nuevoId(), fecha:Date.now(), lineas:lineas, estado:'en curso', por:c.emailAct() };
      var ls=(d().tandas||[]).concat([td]); Q.doc.tandas=ls; Q.tanda=[]; Q.guardada=true; c.pintar();
      guardar({ tandas:ls }); return;
    }
    if(acc==='lista' || acc==='entregada' || acc==='borrar-tanda'){
      if(acc==='borrar-tanda' && !confirm('¿Borrar esta tanda?')) return;
      if(acc==='entregada') alert('Acordate de hacer el remito al cine y tocar "Dar de alta un remito" para que se sume al stock del Candy.');
      var l2=(d().tandas||[]).map(function(x){ if(x.id===b.dataset.id && acc!=='borrar-tanda'){ x=Object.assign({},x,{estado:acc}); if(acc==='lista'){ x.lineas=x.lineas.map(function(l){ return Object.assign({},l,{hechos:l.cant}); }); } } return x; }).filter(function(x){ return !(acc==='borrar-tanda' && x.id===b.dataset.id); });
      Q.doc.tandas=l2; c.pintar(); guardar({ tandas:l2 }); return;
    }
  });
  document.addEventListener('change', function(e){
    var t=e.target, c=C(); if(!t.dataset) return;
    if(t.dataset.prCfg){ var cf=Object.assign({}, d().cfg||{}); cf[t.dataset.prCfg]=c.num(t.value); Q.doc.cfg=cf; guardar({ cfg:cf }); c.pintar(); return; }
    if(t.dataset.prIt){ var cs=Object.assign({}, d().costos||{}), x=Object.assign({}, cs[t.dataset.k]||{}); x[t.dataset.prIt]= t.value.trim()==='' ? 0 : parseFloat(String(t.value).replace(',','.'))||0; cs[t.dataset.k]=x; Q.doc.costos=cs; guardar({ costos:cs }); c.pintar(); return; }
    if(t.dataset.prCant!==undefined){ var i=+t.dataset.prCant; if(Q.tanda[i]) Q.tanda[i].cant=Math.max(0,Math.round(c.num(t.value))); c.pintar(); return; }
    if(t.dataset.prHecho){ var p=t.dataset.prHecho.split('|'), l3=(d().tandas||[]).map(function(x){ if(x.id!==p[0]) return x; x=JSON.parse(JSON.stringify(x)); x.lineas[+p[1]].hechos=Math.max(0,Math.round(c.num(t.value))); return x; }); Q.doc.tandas=l3; guardar({ tandas:l3 }); c.pintar(); return; }
    if(t.id==='pr-add-sel' && t.value){ var it=c.items().find(function(x){ return x.id===t.value; }); if(it){ Q.tanda.push({ k:it.id, nombre:it.nombre, cant:1 }); } c.pintar(); }
  });

  var st=document.createElement('style');
  st.textContent=
    '.pr-priv{background:#F5F2ED;border-color:#E2DDD6;color:#3F3A33;font-weight:500}'+
    '.pr-cfg{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:14px 16px 4px}.pr-cfg label{min-width:0;display:flex;flex-direction:column;gap:4px;font-size:0.78rem;font-weight:600;color:#6B665E}'+
    '.pr-cfg input{width:100%}.pr-scroll{overflow-x:auto}.pr-tabla{min-width:980px}.pr-tabla td:first-child{min-width:210px}.pr-tabla td{padding:8px 10px}.pr-tabla th{padding:10px}.pr-in{width:72px}'+
    '.pr-add{padding:10px 16px;border-top:1px solid #F0ECE6}.pr-add select{width:100%;max-width:420px}'+
    '.pr-tot{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;padding:12px 16px;background:#FAF8F5;border-top:1px solid #EEEAE4;border-bottom:1px solid #EEEAE4;margin-bottom:12px}'+
    '.pr-tot span{display:block;font-size:0.7rem;font-weight:700;color:#8A8479;text-transform:uppercase;letter-spacing:0.03em}.pr-tot b{font-size:1.05rem}'+
    '.pr-tanda{border-bottom:1px solid #F0ECE6;padding:12px 16px}.pr-tanda.lista{opacity:0.7}.pr-tanda-h{display:grid;grid-template-columns:1fr 160px auto;gap:12px;align-items:center}.pr-tanda-h b{display:block}.pr-tanda-h small{color:#8A8479;font-size:0.8rem}'+
    '.pr-bar{background:#F0ECE6;border-radius:999px;height:10px;overflow:hidden}.pr-bar i{display:block;height:100%;background:#2D6A4F}'+
    '.pr-lineas{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:6px 16px;margin-top:10px}.pr-lineas label{display:flex;align-items:center;gap:6px;font-size:0.85rem}.pr-lineas span{flex:1;min-width:0}'+
    '@media(max-width:860px){.pr-cfg{grid-template-columns:1fr 1fr}.pr-tot{grid-template-columns:repeat(3,1fr)}.pr-tanda-h{grid-template-columns:1fr}}';
  document.head.appendChild(st);

  window.ptProduccion = { html:html, entrar:function(){ Q.tanda=null; suscribir(); } };
})();
