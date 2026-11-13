// Estadísticas para el cliente (Rubén): cuánto vende, cuánto recauda, qué queda, qué se viene.
// No usa costos ni nada privado: solo el portal (items, historial, tickets) y las fechas.
(function(){
  function C(){ return window.ptCore; }
  function MT(){ return window.ptMetricas; }
  var R={ per:'mes' };
  var MESES=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  var DSEM=['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];

  function rango(per){
    var m=MT(), hoy=m.hoyIso(), d=m.deIso(hoy);
    if(per==='mes'){ var ini=m.iso(new Date(d.getFullYear(),d.getMonth(),1)); var pIni=m.iso(new Date(d.getFullYear(),d.getMonth()-1,1)); var pFin=m.sumarDias(pIni, d.getDate()-1); return { ini:ini, fin:hoy, pIni:pIni, pFin:pFin, nom:'este mes', comp:'al mismo día del mes pasado' }; }
    var n = per==='7' ? 7 : 30;
    return { ini:m.sumarDias(hoy,-(n-1)), fin:hoy, pIni:m.sumarDias(hoy,-(2*n-1)), pFin:m.sumarDias(hoy,-n), nom:'últimos '+n+' días', comp:'los '+n+' días anteriores' };
  }
  function precios(it){ var c=C(), p=c.num(it.precio), s=c.num(it.sugerido); return { paga:p, vende:s||p, tiene:!!s }; }
  // suma por producto en un rango
  function sumar(D, ini, fin){
    var c=C(), out={u:0, rec:0, paga:0, gan:0, sinSug:0, por:{}};
    c.items().forEach(function(it){
      var u=0; (D.porItem[it.id]||[]).forEach(function(x){ if(x[0]>=ini && x[0]<=fin) u+=x[1]; });
      if(!u) return;
      var p=precios(it); out.u+=u; out.rec+=u*p.vende; out.paga+=u*p.paga; if(p.tiene) out.gan+=u*(p.vende-p.paga); else out.sinSug++;
      out.por[it.id]={ it:it, u:u, rec:u*p.vende };
    });
    return out;
  }
  function flecha(a,b){
    if(!b) return a? '<span class="rb-up">nuevo</span>' : '';
    var pct=Math.round((a-b)/b*100);
    if(pct===0) return '<span class="cs-gris">igual que antes</span>';
    return pct>0 ? '<span class="rb-up">▲ '+pct+'%</span>' : '<span class="rb-down">▼ '+Math.abs(pct)+'%</span>';
  }
  function red(n){ return Math.round(n); }

  function html(){
    var c=C(), m=MT(); if(!m) return '<div class="cs-in">Cargando…</div>';
    var D=m.datos().D, S=D.S, r=rango(R.per), A=sumar(D,r.ini,r.fin), B=sumar(D,r.pIni,r.pFin), res=c.resumen();
    var hayU=0, hayVal=0; c.items().forEach(function(it){ if(it.oculto) return; var h=c.hayDe(it,res); hayU+=h; hayVal+=h*precios(it).vende; });

    var h='<div class="cs-in"><div class="cs-titulo"><div><h2>Mis ventas</h2><p class="cs-sub">Cuánto vendiste, cuánto recaudaste y qué te conviene tener a mano. Se arma solo con los tickets que cargás.</p></div></div>';
    h+='<div class="cs-seg rb-per">'+[['7','Últimos 7 días'],['mes','Este mes'],['30','Últimos 30 días']].map(function(x){ return '<button type="button" class="'+(R.per===x[0]?'on':'')+'" data-rb="per" data-v="'+x[0]+'">'+x[1]+'</button>'; }).join('')+'</div>';

    h+='<div class="cs-kpis mt-kpis">'+
      '<div class="cs-kpi destacado"><span>Recaudaste '+r.nom+'</span><b>'+c.peso(red(A.rec))+'</b><small>'+flecha(A.rec,B.rec)+' vs '+r.comp+'</small></div>'+
      '<div class="cs-kpi"><span>Productos vendidos</span><b>'+c.cant(red(A.u))+'</b><small>'+flecha(A.u,B.u)+'</small></div>'+
      '<div class="cs-kpi"><span>Te queda a vos</span><b>'+(A.u&&A.gan?c.peso(red(A.gan)):'—')+'</b><small>'+(A.sinSug?A.sinSug+' producto(s) sin precio al público':'recaudado menos lo de Chulengo')+'</small></div>'+
      '<div class="cs-kpi"><span>Mercadería en el Candy</span><b>'+c.cant(hayU)+' u.</b><small>vale '+c.peso(red(hayVal))+' al público</small></div>'+
    '</div>';

    // Más vendidos
    var top=Object.keys(A.por).map(function(k){ return A.por[k]; }).sort(function(a,b){ return b.u-a.u; }).slice(0,8), mx=top.length?top[0].u:1;
    h+='<div class="rb-2col"><div class="cs-card"><div class="cs-card-h"><div><h3>🏆 Lo que más se vendió</h3><small class="cs-gris">'+r.nom+'</small></div></div>';
    if(!top.length) h+='<div class="cs-vacio">Todavía no hay ventas en este período.</div>';
    else h+='<div class="rb-rank">'+top.map(function(x,i){ return '<div class="rb-fila"><span class="rb-pos">'+(i+1)+'</span><div class="rb-nom"><b>'+c.esc(x.it.nombre)+'</b><div class="rb-barra"><i style="width:'+Math.max(4,Math.round(x.u/mx*100))+'%"></i></div></div><div class="rb-val"><b>'+c.cant(red(x.u))+' u.</b><small>'+c.peso(red(x.rec))+'</small></div></div>'; }).join('')+'</div>';
    h+='</div>';

    // Quedan pocos
    var sem=m.datos().sem.filter(function(x){ return x.hay<=2 || (x.dias!==null && x.dias<14); });
    h+='<div class="cs-card"><div class="cs-card-h"><div><h3>📦 Quedan pocos</h3><small class="cs-gris">Avisale a Chulengo para que te traiga más</small></div></div>';
    if(!sem.length) h+='<div class="cs-vacio">✓ Tenés de todo por ahora.</div>';
    else h+='<div class="rb-rank">'+sem.slice(0,8).map(function(x){ return '<div class="rb-fila"><span class="mt-dot '+(x.hay===0?'rojo':'amarillo')+'"></span><div class="rb-nom"><b>'+c.esc(x.it.nombre)+'</b><small class="cs-gris">'+(x.hay===0?'Sin stock':x.dias!==null?'Al ritmo de venta alcanza para ~'+Math.max(1,x.dias)+' días':'')+'</small></div><div class="rb-val"><b>'+(x.hay===0?'0':'quedan '+x.hay)+'</b></div></div>'; }).join('')+'</div>';
    h+='</div></div>';

    // Recaudación por mes (6 meses)
    var hoyD=m.deIso(m.hoyIso()), meses=[];
    for(var i=5;i>=0;i--){ var ini=new Date(hoyD.getFullYear(),hoyD.getMonth()-i,1), fin=new Date(hoyD.getFullYear(),hoyD.getMonth()-i+1,0); var x=sumar(D,m.iso(ini),m.iso(fin)); meses.push({ n:MESES[ini.getMonth()], rec:x.rec, u:x.u, act:i===0 }); }
    var mxm=Math.max.apply(null, meses.map(function(x){ return x.rec; }).concat([1]));
    h+='<div class="cs-card"><div class="cs-card-h"><div><h3>📈 Recaudación por mes</h3><small class="cs-gris">Lo que vendiste al público cada mes</small></div></div><div class="rb-meses">'+
      meses.map(function(x){ return '<div class="rb-mes'+(x.act?' act':'')+'"><small>'+(x.rec?c.peso(red(x.rec/1000))+'k':'')+'</small><div class="rb-col"><i style="height:'+Math.max(2,Math.round(x.rec/mxm*100))+'%"></i></div><b>'+x.n.slice(0,3)+'</b><span>'+c.cant(red(x.u))+' u.</span></div>'; }).join('')+
    '</div>'+(meses[5].act?'<div class="mt-nota">El mes actual va hasta hoy.</div>':'')+'</div>';

    // Mejores días + próximas fechas
    var porWd=[0,0,0,0,0,0,0], nWd=[0,0,0,0,0,0,0], d0=Object.keys(S).sort()[0];
    if(d0){ for(var d=d0; d<=m.hoyIso(); d=m.sumarDias(d,1)){ var wd=m.deIso(d).getDay(); porWd[wd]+=(S[d]||{}).u||0; nWd[wd]++; } }
    var prom=porWd.map(function(u,i){ return nWd[i]?u/nWd[i]:0; }), mxw=Math.max.apply(null,prom.concat([0.01])), orden=[1,2,3,4,5,6,0];
    var mejor=orden.slice().sort(function(a,b){ return prom[b]-prom[a]; })[0];
    h+='<div class="rb-2col"><div class="cs-card"><div class="cs-card-h"><div><h3>📅 Qué días se vende más</h3><small class="cs-gris">Promedio de productos vendidos por día</small></div></div>';
    h+='<div class="rb-rank">'+orden.map(function(i){ return '<div class="rb-fila"><div class="rb-nom" style="flex:0 0 92px"><b style="text-transform:capitalize">'+DSEM[i]+'</b></div><div class="rb-nom"><div class="rb-barra'+(i===mejor?' top':'')+'"><i style="width:'+Math.max(3,Math.round(prom[i]/mxw*100))+'%"></i></div></div><div class="rb-val"><b>'+(Math.round(prom[i]*10)/10).toString().replace('.',',')+'</b></div></div>'; }).join('')+'</div>';
    if(prom[mejor]) h+='<div class="mt-nota">Los <b>'+DSEM[mejor]+'</b> son tu mejor día: conviene tener el Candy bien surtido.</div>';
    h+='</div>';

    var hoy=m.hoyIso(), lim=m.sumarDias(hoy,45), ev=m.todos().filter(function(e){ return e.hasta>=hoy && e.fecha<=lim && e.tipo!=='vacaciones'; }).sort(function(a,b){ return a.fecha<b.fecha?-1:1; }).slice(0,8);
    h+='<div class="cs-card"><div class="cs-card-h"><div><h3>🎬 Lo que se viene</h3><small class="cs-gris">Estrenos, obras y fechas que mueven el Candy</small></div></div>';
    if(!ev.length) h+='<div class="cs-vacio">No hay fechas cargadas para las próximas semanas.</div>';
    else h+='<div class="rb-rank">'+ev.map(function(e){ var dd=m.difDias(hoy,e.fecha), f=m.deIso(e.fecha); return '<div class="rb-fila"><span class="rb-ico">'+(m.ICO[e.tipo]||'📌')+'</span><div class="rb-nom"><b>'+c.esc(e.titulo)+'</b><small class="cs-gris">'+DSEM[f.getDay()]+' '+f.getDate()+' de '+MESES[f.getMonth()]+'</small></div><div class="rb-val"><b>'+(dd<=0?'hoy':dd===1?'mañana':'en '+dd+' días')+'</b></div></div>'; }).join('')+'</div>';
    h+='</div></div>';
    return h+'</div>';
  }

  document.addEventListener('click', function(e){
    var b=e.target.closest('[data-rb]'); if(!b) return;
    if(b.dataset.rb==='per'){ R.per=b.dataset.v; C().pintar(); }
  });

  (function(){
    var st=document.createElement('style');
    st.textContent=
      '.rb-up{color:#15803D;font-weight:700}.rb-down{color:#B91C1C;font-weight:700}'+
      '.rb-per{max-width:520px}'+
      '.rb-2col{display:grid;grid-template-columns:1fr 1fr;gap:16px}.rb-2col>.cs-card{margin-bottom:16px}@media(max-width:760px){.rb-2col{grid-template-columns:1fr;gap:0}}'+
      '.rb-rank{padding:6px 18px 12px}.rb-fila{display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid #F1EEE9}.rb-fila:last-child{border-bottom:none}'+
      '.rb-pos{flex:0 0 26px;height:26px;border-radius:50%;background:#F1EEE9;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.8rem;color:#6B665E}'+
      '.rb-fila:first-child .rb-pos{background:#FDE68A;color:#78350F}.rb-ico{flex:0 0 26px;text-align:center;font-size:1.1rem}'+
      '.rb-nom{flex:1;min-width:0}.rb-nom b{display:block;font-size:0.92rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rb-nom small{display:block;font-size:0.78rem;margin-top:2px}'+
      '.rb-barra{height:7px;background:#F1EEE9;border-radius:99px;margin-top:6px;overflow:hidden}.rb-barra i{display:block;height:100%;background:#52B788;border-radius:99px}.rb-barra.top i{background:#2D6A4F}'+
      '.rb-val{text-align:right;flex-shrink:0}.rb-val b{display:block;font-size:0.92rem}.rb-val small{color:#6B665E;font-size:0.78rem}'+
      '.rb-meses{display:flex;gap:10px;align-items:flex-end;padding:18px 18px 12px;height:230px}'+
      '.rb-mes{flex:1;display:flex;flex-direction:column;align-items:center;height:100%;gap:5px}.rb-mes small{font-size:0.74rem;color:#6B665E;height:16px}.rb-mes b{font-size:0.82rem;text-transform:capitalize}.rb-mes span{font-size:0.72rem;color:#8A847B}'+
      '.rb-col{flex:1;width:100%;max-width:64px;display:flex;align-items:flex-end}.rb-col i{display:block;width:100%;background:#B7DCC8;border-radius:6px 6px 2px 2px}.rb-mes.act .rb-col i{background:#2D6A4F}';
    document.head.appendChild(st);
  })();

  window.ptRuben = { html:html };
})();
