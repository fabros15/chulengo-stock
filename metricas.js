// ═══ Métricas y reposición del Candy (solo equipo Chulengo) ═══
// Usa: tickets de la página + historial importado del Excel de Rubén (P.doc.hist),
// eventos cargados a mano (P.doc.eventos: estrenos, obras de teatro) y el clima de Puerto Madryn (Open-Meteo).
(function(){
  var LAT=-42.77, LON=-65.04;
  var C=function(){ return window.ptCore; };
  var DIAS=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  var M = { clima:null, prono:null, cargandoClima:false, errClima:null, nuevoEv:false, verTodosSem:false };

  function iso(d){ var c=C(); return d.getFullYear()+'-'+c.pad(d.getMonth()+1)+'-'+c.pad(d.getDate()); }
  function deIso(s){ var p=s.split('-'); return new Date(+p[0], +p[1]-1, +p[2]); }
  function hoyIso(){ return iso(new Date()); }
  function sumarDias(s,n){ var d=deIso(s); d.setDate(d.getDate()+n); return iso(d); }
  function difDias(a,b){ return Math.round((deIso(b)-deIso(a))/864e5); }
  function palabras(s){ return C().norm(s).replace(/\(.*?\)/g,' ').split(' ').filter(function(w){ return w.length>1; }); }
  // Firestore no acepta arrays anidados: el historial se guarda como objetos {d,n,c} / {d,u,m}
  function hist(){
    var d=C().P.doc, h=(d && d.hist) || {};
    function v(r){ return Array.isArray(r) ? r : [r.d, r.n, r.c]; }
    function l(r){ return Array.isArray(r) ? r : [r.d, r.u, r.m]; }
    return { v:(h.v||[]).map(v), e:(h.e||[]).map(v), liq:(h.liq||[]).map(l) };
  }
  function eventos(){ var d=C().P.doc; return (d && Array.isArray(d.eventos)) ? d.eventos : []; }
  // Feriados nacionales, fechas comerciales y fechas extraordinarias (fijas, no se borran).
  // tipo: feriado | especial | vacaciones.  h = hasta (para rangos).
  var FIJAS=[
    {d:'2026-06-15',t:'Feriado: Paso a la Inmortalidad de Güemes',tipo:'feriado'},
    {d:'2026-06-20',t:'Día de la Bandera',tipo:'feriado'},
    {d:'2026-06-21',t:'Día del Padre',tipo:'especial'},
    {d:'2026-07-09',h:'2026-07-10',t:'Día de la Independencia + puente',tipo:'feriado'},
    {d:'2026-07-13',h:'2026-07-24',t:'Vacaciones de invierno en Chubut',tipo:'vacaciones'},
    {d:'2026-07-20',t:'Día del Amigo',tipo:'especial'},
    {d:'2026-07-28',t:'Aniversario de Puerto Madryn',tipo:'feriado'},
    {d:'2026-08-16',t:'Día del Niño',tipo:'especial'},
    {d:'2026-08-17',t:'Feriado: Paso a la Inmortalidad de San Martín',tipo:'feriado'},
    {d:'2026-09-21',t:'Día del Estudiante y de la Primavera',tipo:'especial'},
    {d:'2026-10-12',t:'Día de la Diversidad Cultural',tipo:'feriado'},
    {d:'2026-10-18',t:'Día de la Madre',tipo:'especial'},
    {d:'2026-10-31',t:'Halloween',tipo:'especial'},
    {d:'2026-11-08',h:'2026-11-11',t:'Visita del Papa León XIV a la Argentina',tipo:'especial'},
    {d:'2026-11-23',t:'Feriado: Día de la Soberanía Nacional',tipo:'feriado'},
    {d:'2026-12-07',h:'2026-12-08',t:'Puente + Inmaculada Concepción',tipo:'feriado'},
    {d:'2026-12-18',t:'Último día de clases en Chubut',tipo:'especial'},
    {d:'2026-12-19',h:'2027-02-28',t:'Vacaciones de verano',tipo:'vacaciones'},
    {d:'2026-12-24',h:'2026-12-25',t:'Nochebuena y Navidad',tipo:'feriado'},
    {d:'2026-12-31',h:'2027-01-01',t:'Fin de año y Año Nuevo',tipo:'feriado'},
    {d:'2027-01-06',t:'Día de Reyes',tipo:'especial'},
    {d:'2027-02-08',h:'2027-02-09',t:'Carnaval',tipo:'feriado'},
    {d:'2027-02-14',t:'San Valentín',tipo:'especial'},
    {d:'2027-03-24',t:'Día de la Memoria',tipo:'feriado'},
    {d:'2027-03-26',t:'Viernes Santo',tipo:'feriado'}
  ];
  var ICO={pelicula:'🎬',teatro:'🎭',feriado:'🇦🇷',especial:'⭐',vacaciones:'🏖️',otro:'📌'};
  function fijas(){ return FIJAS.map(function(f,i){ return { id:'fx'+i, fecha:f.d, hasta:f.h||f.d, titulo:f.t, tipo:f.tipo, fijo:true }; }); }
  function todos(){ return eventos().map(function(e){ var x=Object.assign({},e); x.hasta=e.hasta||e.fecha; return x; }).concat(fijas()); }
  function enDia(d){ return todos().filter(function(e){ return d>=e.fecha && d<=e.hasta; }); }

  // ── Qué productos actuales corresponden a cada nombre del historial ──
  var cacheMatch={};
  function itemsDeNombre(nombre){
    var c=C(), key=nombre+'|'+c.items().length;
    if(cacheMatch[key]) return cacheMatch[key];
    var pw=palabras(nombre), r=c.items().filter(function(it){
      var iw=palabras(it.nombre); return pw.length && pw.every(function(w){ return iw.indexOf(w)!==-1; });
    });
    cacheMatch[key]=r; return r;
  }

  // ── Ventas por día (historial + tickets) ──
  function ventasPorDia(){
    var c=C(), S={}, porItem={};
    function add(d, u, m){ var x=S[d]||(S[d]={u:0,m:0}); x.u+=u; x.m+=m; }
    function addItem(id, d, u){ (porItem[id]||(porItem[id]=[])).push([d,u]); }
    hist().v.forEach(function(r){
      var d=r[0], nom=r[1], u=c.num(r[2]), its=itemsDeNombre(nom), pr=0;
      if(its.length){ its.forEach(function(it){ pr+=c.num(it.precio); addItem(it.id, d, u/its.length); }); pr/=its.length; }
      add(d, u, u*pr);
    });
    c.P.ventas.forEach(function(v){
      if(v.anulada) return;
      var d = v.dia || iso(c.aFecha(v.fecha));
      c.lineasDe(v).forEach(function(l){ var u=c.num(l.cant); add(d, u, u*c.num(l.precio)); addItem(l.k, d, u); });
    });
    return { S:S, porItem:porItem };
  }
  function primerDia(S){ var k=Object.keys(S).sort(); return k[0]||hoyIso(); }

  // ── Semáforo de reposición ──
  function semaforo(D){
    var c=C(), r=c.resumen(), hoy=hoyIso(), desde=sumarDias(hoy,-28);
    return c.items().filter(function(it){ return !it.oculto; }).map(function(it){
      var hay=c.hayDe(it,r), min=c.num(it.minimo), ult=null, u28=0;
      (D.porItem[it.id]||[]).forEach(function(x){ if(!ult || x[0]>ult) ult=x[0]; if(x[0]>desde) u28+=x[1]; });
      var ritmo=u28/28, dias = ritmo>0 ? Math.floor(hay/ritmo) : null;
      var est='verde';
      if(hay===0 || (min && hay<min) || (dias!==null && dias<7)) est='rojo';
      else if((min && hay<min*1.5) || (dias!==null && dias<21)) est='amarillo';
      else if(!min && dias===null) est='gris';
      var objetivo=Math.max(min, Math.ceil(ritmo*28)), producir=Math.max(0, objetivo-hay);
      var sinVender = ult ? difDias(ult,hoy) : null;
      return { it:it, hay:hay, min:min, ritmo:ritmo, dias:dias, est:est, producir:producir, ult:ult, sinVender:sinVender };
    }).sort(function(a,b){ var o={rojo:0,amarillo:1,verde:2,gris:3}; return o[a.est]-o[b.est] || (a.dias===null?1e9:a.dias)-(b.dias===null?1e9:b.dias) || a.it.nombre.localeCompare(b.it.nombre); });
  }

  // ── Clima (Open-Meteo, sin clave) ──
  function cargarClima(desde){
    if(M.cargandoClima || (M.clima && M.prono)) return;
    M.cargandoClima=true;
    var ayer=sumarDias(hoyIso(),-1);
    var u1='https://archive-api.open-meteo.com/v1/archive?latitude='+LAT+'&longitude='+LON+'&start_date='+desde+'&end_date='+ayer+'&daily=precipitation_sum,temperature_2m_max,wind_speed_10m_max&timezone=America%2FArgentina%2FBuenos_Aires';
    var u2='https://api.open-meteo.com/v1/forecast?latitude='+LAT+'&longitude='+LON+'&daily=weather_code,precipitation_sum,precipitation_probability_max,temperature_2m_max,temperature_2m_min,wind_speed_10m_max&forecast_days=8&timezone=America%2FArgentina%2FBuenos_Aires';
    Promise.all([fetch(u1).then(function(r){ return r.json(); }), fetch(u2).then(function(r){ return r.json(); })]).then(function(res){
      var h={}, a=res[0].daily||{};
      (a.time||[]).forEach(function(t,i){ h[t]={ lluvia:a.precipitation_sum[i], tmax:a.temperature_2m_max[i], viento:a.wind_speed_10m_max[i] }; });
      var f=res[1].daily||{};
      M.clima=h; M.prono=(f.time||[]).map(function(t,i){ return { d:t, code:f.weather_code[i], lluvia:f.precipitation_sum[i], prob:f.precipitation_probability_max[i], tmax:f.temperature_2m_max[i], tmin:f.temperature_2m_min[i], viento:f.wind_speed_10m_max[i] }; });
      M.cargandoClima=false; C().pintar();
    }).catch(function(e){ M.cargandoClima=false; M.errClima=e; C().pintar(); });
  }
  function icono(code, lluvia){
    if(code===undefined || code===null) return lluvia>1?'🌧️':'☀️';
    if(code>=95) return '⛈️'; if(code>=71 && code<=77) return '❄️'; if(code>=51) return '🌧️'; if(code>=45) return '🌫️'; if(code>=2) return '⛅'; return '☀️';
  }

  // ── Qué influye en las ventas ──
  function promedios(S){
    var desde=primerDia(S), hoy=hoyIso(), dias=[];
    for(var d=desde; d<hoy; d=sumarDias(d,1)) dias.push({ d:d, u:(S[d]||{}).u||0, wd:deIso(d).getDay(), dm:deIso(d).getDate() });
    function prom(arr){ if(!arr.length) return null; var t=0; arr.forEach(function(x){ t+=x.u; }); return { p:t/arr.length, n:arr.length }; }
    var gen=prom(dias), porWd=[0,1,2,3,4,5,6].map(function(w){ return prom(dias.filter(function(x){ return x.wd===w; })); });
    var porMes=[[1,10,'Del 1 al 10'],[11,20,'Del 11 al 20'],[21,31,'Del 21 a fin de mes']].map(function(b){ return { t:b[2], r:prom(dias.filter(function(x){ return x.dm>=b[0] && x.dm<=b[1]; })) }; });
    var clima=null;
    if(M.clima){
      var con=dias.filter(function(x){ return M.clima[x.d]; });
      clima=[
        ['🌧️ Días de lluvia', con.filter(function(x){ return M.clima[x.d].lluvia>=1; })],
        ['☀️ Días secos', con.filter(function(x){ return M.clima[x.d].lluvia<1; })],
        ['🥶 Fríos (máx. menos de 12°)', con.filter(function(x){ return M.clima[x.d].tmax<12; })],
        ['🌤️ Templados (12° a 24°)', con.filter(function(x){ return M.clima[x.d].tmax>=12 && M.clima[x.d].tmax<=24; })],
        ['🔥 Calurosos (más de 24°)', con.filter(function(x){ return M.clima[x.d].tmax>24; })],
        ['💨 Mucho viento (más de 45 km/h)', con.filter(function(x){ return M.clima[x.d].viento>45; })]
      ].map(function(z){ return { t:z[0], r:prom(z[1]) }; });
    }
    // eventos pasados: estrenos (10 días siguientes) y obras (ese día)
    var evs=todos().filter(function(e){ return e.fecha>=desde && e.fecha<hoy; }).map(function(e){
      var arr, base=gen;
      if(e.tipo==='pelicula') arr=dias.filter(function(x){ var k=difDias(e.fecha,x.d); return k>=0 && k<10; });
      else arr=dias.filter(function(x){ return x.d>=e.fecha && x.d<=e.hasta; });
      // un solo día: comparar contra el promedio de ese mismo día de la semana
      if(e.fecha===e.hasta && e.tipo!=='pelicula') base=porWd[deIso(e.fecha).getDay()];
      return { e:e, r:prom(arr), base:base };
    });
    var fer=dias.filter(function(x){ return todos().some(function(e){ return e.tipo==='feriado' && x.d>=e.fecha && x.d<=e.hasta; }); });
    var feriados=prom(fer);
    return { gen:gen, porWd:porWd, porMes:porMes, clima:clima, evs:evs, dias:dias, feriados:feriados };
  }
  function vsGen(r, gen){
    if(!r || !gen || !gen.p) return '<span class="mt-v cs-gris">sin datos</span>';
    var pct=Math.round((r.p/gen.p-1)*100), cls = pct>=10?'mas':pct<=-10?'menos':'igual';
    return '<span class="mt-v"><b>'+C().cant(Math.round(r.p*10)/10)+'</b> por día <i class="mt-pct '+cls+'">'+(pct>0?'+':'')+pct+'%</i>'+(r.n<6?' <small class="cs-gris">(pocos días)</small>':'')+'</span>';
  }

  // ── Gráfico de ventas por semana con estrenos/obras marcados ──
  function grafico(S){
    var c=C(), hoy=deIso(hoyIso()), lunes=new Date(hoy); lunes.setDate(hoy.getDate()-((hoy.getDay()+6)%7));
    var sem=[], N=22;
    for(var i=N-1;i>=0;i--){ var ini=new Date(lunes); ini.setDate(lunes.getDate()-7*i); var u=0;
      for(var k=0;k<7;k++){ var d=new Date(ini); d.setDate(ini.getDate()+k); u+=((S[iso(d)]||{}).u||0); }
      sem.push({ ini:iso(ini), u:u }); }
    var max=Math.max.apply(null, sem.map(function(x){ return x.u; }).concat([1]));
    var W=720, H=180, bw=W/N, h='<svg viewBox="0 0 '+W+' '+(H+34)+'" class="mt-svg" preserveAspectRatio="none">';
    sem.forEach(function(x,i){
      var bh=Math.round((x.u/max)*(H-24)), y=H-bh;
      h+='<rect x="'+(i*bw+4)+'" y="'+y+'" width="'+(bw-8)+'" height="'+bh+'" rx="3" class="mt-bar'+(i===N-1?' actual':'')+'"><title>Semana del '+c.diaTxt(x.ini)+': '+x.u+' u.</title></rect>';
      if(x.u) h+='<text x="'+(i*bw+bw/2)+'" y="'+(y-4)+'" class="mt-val">'+Math.round(x.u)+'</text>';
      if(i%3===0 || i===N-1){ var p=x.ini.split('-'); h+='<text x="'+(i*bw+bw/2)+'" y="'+(H+14)+'" class="mt-lab">'+p[2]+'/'+p[1]+'</text>'; }
      var marcas=todos().filter(function(e){ return e.tipo!=='vacaciones' && e.fecha>=x.ini && e.fecha<sumarDias(x.ini,7); });
      if(marcas.length) h+='<text x="'+(i*bw+bw/2)+'" y="'+(H+29)+'" class="mt-ev"><title>'+marcas.map(function(e){ return c.esc(e.titulo)+' ('+c.diaTxt(e.fecha)+')'; }).join(' · ')+'</title>'+marcas.slice(0,2).map(function(e){ return ICO[e.tipo]||'📌'; }).join('')+'</text>';
      if(todos().some(function(e){ return e.tipo==='vacaciones' && e.fecha<sumarDias(x.ini,7) && e.hasta>=x.ini; })) h+='<rect x="'+(i*bw+2)+'" y="'+(H+2)+'" width="'+(bw-4)+'" height="3" class="mt-vac"><title>Vacaciones</title></rect>';
    });
    return h+'</svg>';
  }

  // ── Pantalla ──
  function html(){
    var c=C(), D=ventasPorDia(), S=D.S, r=c.resumen(), hoy=hoyIso(), H=hist();
    if(!M.clima && !M.cargandoClima && !M.errClima) setTimeout(function(){ cargarClima(primerDia(S)); }, 0);
    var mes=hoy.slice(0,7), dAnt=deIso(hoy); dAnt.setDate(1); dAnt.setMonth(dAnt.getMonth()-1); var mesAnt=iso(dAnt).slice(0,7);
    var diaMes=+hoy.slice(8,10), um=0, mm=0, ua=0, ma=0, uaParcial=0;
    Object.keys(S).forEach(function(d){ var x=S[d];
      if(d.slice(0,7)===mes){ um+=x.u; mm+=x.m; }
      if(d.slice(0,7)===mesAnt){ ua+=x.u; ma+=x.m; if(+d.slice(8,10)<=diaMes) uaParcial+=x.u; } });
    var valor=0; c.items().forEach(function(it){ if(!it.oculto) valor+=c.hayDe(it,r)*c.num(it.precio); });
    var sem=semaforo(D), rojos=sem.filter(function(x){ return x.est==='rojo'; }).length, amar=sem.filter(function(x){ return x.est==='amarillo'; }).length;
    var P=promedios(S);

    var sub=M.sub||'resumen', proxEst=todos().filter(function(e){ return e.fecha>=hoy && (e.tipo==='pelicula'||e.tipo==='especial'); }).sort(function(a,b){ return a.fecha<b.fecha?-1:1; })[0];
    var dormN=sem.filter(function(x){ return x.hay>0 && x.sinVender!==null && x.sinVender>=30; }).length;
    var h='<div class="cs-in"><div class="cs-titulo"><button type="button" class="cs-btn" data-pt="a-tabla">← Volver</button><div><h2>Métricas</h2><p class="cs-sub">Cómo viene vendiendo el Candy, qué reponer y qué se viene.</p></div></div>';
    if(!H.v.length) h+='<div class="cs-aviso">Todavía no está importado el historial del Excel, así que hay pocos datos.</div>';
    h+='<div class="cs-seg">'+[['resumen','Resumen'],['reponer','Reponer'+(rojos?' <i class="cs-badge">'+rojos+'</i>':'')],['fechas','Fechas y estrenos'],['analisis','Qué influye']].map(function(t){ return '<button type="button" class="'+(sub===t[0]?'on':'')+'" data-mt="sub" data-sub="'+t[0]+'">'+t[1]+'</button>'; }).join('')+'</div>';

    if(sub==='resumen'){
    // KPIs
    h+='<div class="cs-kpis mt-kpis">'+
      '<div class="cs-kpi"><span>Vendido este mes</span><b>'+c.cant(Math.round(um))+' u.</b><small>≈ '+c.peso(mm)+' · al día '+diaMes+' del mes pasado: '+c.cant(Math.round(uaParcial))+' u.</small></div>'+
      '<div class="cs-kpi"><span>Mes pasado completo</span><b>'+c.cant(Math.round(ua))+' u.</b><small>≈ '+c.peso(ma)+'</small></div>'+
      '<div class="cs-kpi"><span>Plata en el Candy</span><b>'+c.peso(valor)+'</b><small>lo que hay, a precio de Rubén</small></div>'+
      '<div class="cs-kpi"><span>Reponer</span><b>'+(rojos?'<span style="color:#B91C1C">'+rojos+' urgentes</span>':'Nada urgente')+'</b><small>'+amar+' para ir preparando</small></div>'+
    '</div>';

      // Para hacer ahora
      var tareas=[];
      if(rojos) tareas.push('<button type="button" class="mt-tarea rojo" data-mt="sub" data-sub="reponer"><b>'+rojos+(rojos===1?' producto urgente':' productos urgentes')+' para reponer</b><span>Ver qué imprimir →</span></button>');
      if(proxEst){ var fx=difDias(hoy,proxEst.fecha); if(fx<=30) tareas.push('<button type="button" class="mt-tarea'+(fx<=21?' amarillo':'')+'" data-mt="sub" data-sub="fechas"><b>'+(ICO[proxEst.tipo]||'📌')+' '+c.esc(proxEst.titulo)+' en '+fx+' días</b><span>'+(fx<=21?'Tené el merch listo':'Ver calendario')+' →</span></button>'); }
      if(dormN) tareas.push('<button type="button" class="mt-tarea" data-mt="sub" data-sub="reponer"><b>😴 '+dormN+' producto'+(dormN===1?'':'s')+' sin venderse hace +30 días</b><span>Pensar precio →</span></button>');
      var sinMin=c.items().filter(function(it){ return !it.oculto && !c.num(it.minimo); }).length;
      if(sinMin) tareas.push('<button type="button" class="mt-tarea" data-mt="sub" data-sub="reponer"><b>'+sinMin+' productos sin mínimo cargado</b><span>Cargarlos para que avise →</span></button>');
      if(tareas.length) h+='<div class="mt-tareas">'+tareas.join('')+'</div>';
      h+='<div class="cs-card"><div class="cs-card-h"><h3>Próximos 7 días</h3><span class="cs-gris mt-ley">clima en Madryn y ventas esperadas</span></div>';
    if(M.prono){
      h+='<div class="mt-prono">'+M.prono.slice(0,7).map(function(p){
        var wd=deIso(p.d).getDay(), base=P.porWd[wd], est=base?base.p:0, llu=null, seco=null;
        if(P.clima){ llu=P.clima[0].r; seco=P.clima[1].r; }
        if(p.lluvia>=1 && llu && seco && seco.p) est*=Math.min(1.6,Math.max(0.6,llu.p/seco.p));
        var ev=enDia(p.d);
        return '<div class="mt-dia'+(ev.length?' con-ev':'')+'"><b>'+(p.d===hoy?'Hoy':DIAS[wd]+' '+(+p.d.slice(8,10)))+'</b><i>'+icono(p.code,p.lluvia)+'</i>'+
          '<span>'+Math.round(p.tmax)+'° / '+Math.round(p.tmin)+'°</span><small>'+(p.prob!=null?p.prob+'% lluvia':'')+'</small>'+
          '<em>~'+Math.round(est)+' ventas</em>'+(ev.length?'<small class="mt-evd">'+ev.map(function(e){ return (ICO[e.tipo]||'📌')+' '+c.esc(e.titulo); }).join('<br>')+'</small>':'')+'</div>';
      }).join('')+'</div><div class="mt-nota">Ventas esperadas según cómo vienen los mismos días de la semana desde junio, ajustado si llueve.</div>';
    } else h+='<div class="cs-vacio">'+(M.errClima?'No se pudo cargar el pronóstico.':'Cargando pronóstico…')+'</div>';
      h+='</div>';
    // Gráfico
    h+='<div class="cs-card"><div class="cs-card-h"><h3>Ventas por semana</h3><span class="cs-gris mt-ley">🎬 estreno · 🎭 obra</span></div><div class="mt-graf">'+grafico(S)+'</div></div>';

    }

    if(sub==='reponer'){
    // Semáforo
    h+='<div class="cs-card"><div class="cs-card-h"><h3>Reposición</h3><span class="cs-gris mt-ley">🔴 urgente · 🟡 preparar · 🟢 bien · ⚪ sin mínimo ni ventas</span></div>'+
      '<table class="cs-tabla mt-sem"><thead><tr><th>Producto</th><th class="n">Hay</th><th class="n">Mínimo</th><th class="n">Vende</th><th class="n">Se agota</th><th class="n">Producir</th></tr></thead><tbody>';
    (M.verTodosSem?sem:sem.slice(0,15)).forEach(function(x){
      h+='<tr><td><div class="cs-prod"><span class="mt-dot '+x.est+'"></span><div><b>'+c.esc(x.it.nombre)+'</b>'+
        (x.sinVender!==null && x.sinVender>=30 && x.hay>0?'<small class="mt-dorm">😴 '+x.sinVender+' días sin venderse</small>':'')+'</div></div></td>'+
        '<td class="n"><b>'+c.cant(x.hay)+'</b></td>'+
        '<td class="n"><input class="mt-min" inputmode="numeric" data-mt-min="'+c.esc(x.it.id)+'" value="'+(x.min||'')+'" placeholder="—"></td>'+
        '<td class="n">'+(x.ritmo>0?c.cant(Math.round(x.ritmo*7*10)/10)+'/sem':'<span class="cs-gris">—</span>')+'</td>'+
        '<td class="n">'+(x.hay===0?'<b style="color:#B91C1C">Agotado</b>':x.dias===null?'<span class="cs-gris">—</span>':(x.dias>365?'+1 año':x.dias+' días'))+'</td>'+
        '<td class="n">'+(x.producir?'<b>'+x.producir+'</b>':'<span class="cs-gris">—</span>')+'</td></tr>';
    });
    h+='</tbody></table>'+(sem.length>15&&!M.verTodosSem?'<div style="padding:10px 16px"><button type="button" class="cs-btn ghost" data-mt="ver-sem">Ver los '+sem.length+'</button></div>':'')+
      '<div class="mt-nota">El <b>mínimo</b> lo ponés vos (cuántos querés que haya siempre). "Vende" y "se agota" salen de las últimas 4 semanas. "Producir" = lo que falta para tener el mínimo o un mes de ventas.</div></div>';

    // Dormidos
    var dorm=sem.filter(function(x){ return x.hay>0 && x.sinVender!==null && x.sinVender>=30; }).sort(function(a,b){ return b.sinVender-a.sinVender; });
    if(dorm.length){
      h+='<div class="cs-card"><div class="cs-card-h"><h3>😴 Productos dormidos</h3></div><div class="cs-movs">'+dorm.map(function(x){
        var sug = x.sinVender>=60 ? 'Retirarlo o liquidarlo' : 'Probar bajarle el precio';
        return '<div class="cs-mov"><span class="cs-tag '+(x.sinVender>=60?'rojo':'gris')+'">'+x.sinVender+' días</span><div class="cs-mov-t"><b>'+c.esc(x.it.nombre)+'</b><small>Hay '+c.cant(x.hay)+' · '+c.peso(x.hay*c.num(x.it.precio))+' parados · última venta '+c.diaTxt(x.ult)+'</small></div><div class="cs-mov-r"><b>'+sug+'</b></div></div>';
      }).join('')+'</div></div>';
    }

    }

    if(sub==='fechas'){
      var prox=todos().filter(function(e){ return e.hasta>=hoy; }).sort(function(a,b){ return a.fecha<b.fecha?-1:1; });
      h+='<div class="cs-card"><div class="cs-card-h"><h3>Próximas fechas</h3><button type="button" class="cs-btn" data-mt="nuevo-ev">+ Agregar estreno, obra o fecha</button></div>';
    if(M.nuevoEv){
      h+='<div class="mt-form"><input type="date" id="mt-ev-fecha" class="cs-input"><select id="mt-ev-tipo" class="cs-input"><option value="pelicula">🎬 Estreno de película</option><option value="teatro">🎭 Obra / show en el cine</option><option value="especial">⭐ Fecha especial (evento, visita, festival…)</option><option value="feriado">🇦🇷 Feriado local</option><option value="otro">📌 Otro</option></select>'+
        '<input id="mt-ev-titulo" class="cs-input" placeholder="Título (ej: Avengers: Doomsday)"><input id="mt-ev-nota" class="cs-input" placeholder="Merch / nota (opcional)">'+
        '<div><button type="button" class="cs-btn primario" data-mt="guardar-ev">Guardar</button> <button type="button" class="cs-btn ghost" data-mt="cancelar-ev">Cancelar</button></div></div>';
    }
    if(!prox.length) h+='<div class="cs-vacio">No hay estrenos ni obras cargados.</div>';
    prox.slice(0, M.verTodasFechas?80:12).forEach(function(e){
      var falta=difDias(hoy,e.fecha), aviso = (e.tipo==='pelicula' || e.tipo==='especial') && falta<=21 && falta>=0;
      var cuando = e.fecha<=hoy ? (e.hasta>e.fecha?'en curso hasta el '+c.diaTxt(e.hasta):'hoy') : 'faltan '+falta+' días';
      h+='<div class="mt-ev-f'+(e.fijo?' fijo':'')+'"><span class="mt-ev-i">'+(ICO[e.tipo]||'📌')+'</span><div><b>'+c.esc(e.titulo)+'</b><small>'+c.diaTxt(e.fecha)+(e.hasta>e.fecha?' al '+c.diaTxt(e.hasta):'')+' · '+cuando+(e.nota?' · '+c.esc(e.nota):'')+'</small>'+
        (aviso?'<small class="mt-alerta">⚠️ Menos de 3 semanas: '+(e.tipo==='pelicula'?'tené el merch listo':'¿hay algo para vender ese día?')+'</small>':'')+'</div>'+
        (e.fijo?'':'<button type="button" class="cs-link" data-mt="borrar-ev" data-id="'+c.esc(e.id)+'">Quitar</button>')+'</div>';
    });
    if(prox.length>12 && !M.verTodasFechas) h+='<div style="padding:8px 16px"><button type="button" class="cs-btn ghost" data-mt="ver-fechas">Ver todas ('+prox.length+')</button></div>';
      h+='</div>';
    h+='<div class="cs-card"><div class="cs-card-h"><h3>Cómo vendieron los estrenos, obras y fechas especiales</h3></div><div class="mt-inf">'+
      (P.evs.length ? P.evs.slice().reverse().map(function(z){
        var lab = z.e.tipo==='pelicula' ? '10 días después del estreno de ' : (z.e.hasta>z.e.fecha ? '' : '');
        return '<div><span>'+(ICO[z.e.tipo]||'📌')+' '+lab+c.esc(z.e.titulo)+' <small class="cs-gris">'+c.diaTxt(z.e.fecha)+'</small></span>'+vsGen(z.r,z.base)+'</div>'; }).join('') : '<div class="cs-gris">Todavía no hay fechas pasadas con ventas cargadas.</div>')+
      '</div><div class="mt-nota">Estrenos: los 10 días siguientes contra el promedio general. Fechas de un solo día: contra el promedio de ese mismo día de la semana. Rangos (vacaciones, visita del Papa): todo el período contra el promedio general.</div></div>';

    }

    if(sub==='analisis'){
      h+='<div class="mt-3col">';
    // Qué influye
    var maxWd=Math.max.apply(null,P.porWd.map(function(x){ return x?x.p:0; }).concat([0.1]));
    h+='<div class="cs-card"><div class="cs-card-h"><h3>Qué día se vende más</h3></div><div class="mt-barras">'+
      [1,2,3,4,5,6,0].map(function(w){ var x=P.porWd[w]; return '<div class="mt-bh"><span>'+DIAS[w]+'</span><div><i style="width:'+(x?Math.round(x.p/maxWd*100):0)+'%"></i></div><b>'+(x?c.cant(Math.round(x.p*10)/10):'—')+'</b></div>'; }).join('')+
      '</div><div class="mt-nota">Promedio de ventas por día desde junio.</div>'+
      '<div class="cs-card-h" style="border-top:1px solid #EEEAE4"><h3>Según el día del mes</h3></div><div class="mt-inf">'+
      P.porMes.map(function(b){ return '<div><span>'+b.t+'</span>'+vsGen(b.r,P.gen)+'</div>'; }).join('')+'</div></div>';
    h+='<div class="cs-card"><div class="cs-card-h"><h3>Clima y eventos</h3></div><div class="mt-inf">'+
      (P.clima ? P.clima.map(function(b){ return '<div><span>'+b.t+'</span>'+vsGen(b.r,P.gen)+'</div>'; }).join('') : '<div class="cs-gris">'+(M.errClima?'No se pudo cargar el clima.':'Cargando clima…')+'</div>')+
      '<div><span>🇦🇷 Todos los feriados</span>'+vsGen(P.feriados,P.gen)+'</div>'+
      '</div><div class="mt-nota">Comparado con el promedio general ('+(P.gen?c.cant(Math.round(P.gen.p*10)/10):'—')+' ventas por día). Clima de Puerto Madryn (Open-Meteo).</div></div>';
      h+='</div>';
    // Cobros
    if(H.liq && H.liq.length){
      var mx=Math.max.apply(null,H.liq.map(function(l){ return l[2]; }));
      h+='<div class="cs-card"><div class="cs-card-h"><h3>Lo que te pagó en cada liquidación</h3></div><div class="mt-barras">'+
        H.liq.map(function(l){ return '<div class="mt-bh ancho"><span>'+c.diaTxt(l[0])+'</span><div><i style="width:'+Math.round(l[2]/mx*100)+'%"></i></div><b>'+c.peso(l[2])+'</b></div>'; }).join('')+
        '</div><div class="mt-nota">Del Excel de Rubén (hoja DEUDA FABRIZIO).</div></div>';
    }
    }
    return h+'</div>';
  }

  // ── Acciones ──
  document.addEventListener('click', function(e){
    var b=e.target.closest('[data-mt]'); if(!b) return;
    var c=C(), acc=b.dataset.mt;
    if(acc==='nuevo-ev'){ M.nuevoEv=!M.nuevoEv; c.pintar(); return; }
    if(acc==='cancelar-ev'){ M.nuevoEv=false; c.pintar(); return; }
    if(acc==='ver-sem'){ M.verTodosSem=true; c.pintar(); return; }
    if(acc==='sub'){ M.sub=b.dataset.sub; c.pintar(); var ov=document.getElementById('pt-overlay'); if(ov) ov.scrollTop=0; return; }
    if(acc==='ver-fechas'){ M.verTodasFechas=true; c.pintar(); return; }
    if(acc==='guardar-ev'){
      var f=(document.getElementById('mt-ev-fecha')||{}).value, t=((document.getElementById('mt-ev-titulo')||{}).value||'').trim();
      if(!f || !t){ alert('Poné la fecha y el título.'); return; }
      var ev={ id:c.nuevoId(), fecha:f, titulo:t, tipo:(document.getElementById('mt-ev-tipo')||{}).value||'pelicula', nota:((document.getElementById('mt-ev-nota')||{}).value||'').trim() };
      var lista=eventos().concat([ev]); c.P.doc.eventos=lista; M.nuevoEv=false; c.pintar();
      c.db().collection('consig_portal').doc(c.P.pid).update({ eventos:lista }).catch(function(err){ alert('No se pudo guardar: '+err.message); });
      return;
    }
    if(acc==='borrar-ev'){
      var ls=eventos().filter(function(x){ return x.id!==b.dataset.id; }); c.P.doc.eventos=ls; c.pintar();
      c.db().collection('consig_portal').doc(c.P.pid).update({ eventos:ls }).catch(function(err){ alert('No se pudo guardar: '+err.message); });
    }
  });
  document.addEventListener('change', function(e){
    var t=e.target; if(!t.dataset || !t.dataset.mtMin) return;
    var c=C(), it=c.items().find(function(x){ return x.id===t.dataset.mtMin; }); if(!it) return;
    it.minimo = t.value.trim()==='' ? 0 : Math.max(0, Math.round(c.num(t.value)));
    c.guardarItems();
  });

  var st=document.createElement('style');
  st.textContent=
    '.mt-tareas{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px;margin-bottom:16px}'+
    '.mt-tarea{display:flex;flex-direction:column;gap:3px;text-align:left;padding:12px 14px;border-radius:10px;border:1px solid #E2DDD6;background:#fff;cursor:pointer;font:inherit;color:#1A1814}.mt-tarea b{font-size:0.88rem}.mt-tarea span{font-size:0.78rem;color:#2D6A4F;font-weight:600}.mt-tarea.rojo{border-color:#FECACA;background:#FEF2F2}.mt-tarea.amarillo{border-color:#FDE68A;background:#FFFBEB}.mt-tarea:hover{border-color:#B9B3A9}'+
    '.mt-3col{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}.mt-3col>.cs-card{margin-bottom:0}.mt-3col+*{margin-top:16px}'+
    '.mt-kpis{grid-template-columns:repeat(4,1fr)!important}.mt-kpis .cs-kpi small{display:block;margin-top:2px}'+
    '.mt-2col{display:grid;grid-template-columns:1.25fr 1fr;gap:16px}.mt-2col>.cs-card{margin-bottom:16px}'+
    '.mt-prono{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;padding:12px}'+
    '.mt-dia{border:1px solid #EEEAE4;border-radius:10px;padding:8px 4px;text-align:center;display:flex;flex-direction:column;gap:2px;font-size:0.8rem}.mt-dia.con-ev{border-color:#A7F3D0;background:#F0FDF7}'+
    '.mt-dia i{font-style:normal;font-size:1.4rem}.mt-dia small{color:#8A8479;font-size:0.7rem}.mt-dia em{font-style:normal;font-weight:700;color:#2D6A4F;font-size:0.78rem}.mt-dia .mt-evd{color:#14532D;font-weight:600}'+
    '.mt-nota{padding:8px 16px 14px;font-size:0.78rem;color:#8A8479}'+
    '.mt-form{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:12px 16px;border-bottom:1px solid #EEEAE4;background:#FAF8F5}.mt-form>div{grid-column:1/-1}'+
    '.mt-ev-f{display:flex;align-items:flex-start;gap:10px;padding:10px 16px;border-bottom:1px solid #F0ECE6}.mt-ev-f>div{flex:1;min-width:0}.mt-ev-f b{display:block;font-size:0.9rem}.mt-ev-f small{display:block;color:#8A8479;font-size:0.78rem}.mt-ev-i{font-size:1.2rem}'+
    '.mt-alerta{color:#B45309!important;font-weight:600}'+
    '.mt-ley{font-size:0.75rem}.mt-dot{width:12px;height:12px;border-radius:50%;flex-shrink:0;background:#D9D3C9}.mt-dot.rojo{background:#DC2626}.mt-dot.amarillo{background:#F59E0B}.mt-dot.verde{background:#16A34A}'+
    '.mt-sem .cs-prod{gap:10px}.mt-dorm{color:#B45309!important}'+
    '.mt-min{width:56px;padding:6px;border:1px solid #D9D3C9;border-radius:6px;text-align:center;font:inherit;font-weight:700;background:#fff;color:#1A1814}'+
    '.mt-graf{padding:12px 10px 4px}.mt-svg{width:100%;height:220px;display:block}.mt-bar{fill:#A3B8AC}.mt-bar.actual{fill:#2D6A4F}'+
    '.mt-vac{fill:#F59E0B}.mt-ev-f.fijo{background:#FCFBF9}.mt-val{font-size:10px;fill:#6B665E;text-anchor:middle}.mt-lab{font-size:10px;fill:#8A8479;text-anchor:middle}.mt-ev{font-size:12px;text-anchor:middle}'+
    '.mt-barras{padding:12px 16px;display:flex;flex-direction:column;gap:7px}.mt-bh{display:grid;grid-template-columns:40px 1fr 44px;gap:8px;align-items:center;font-size:0.82rem}.mt-bh.ancho{grid-template-columns:84px 1fr 96px}'+
    '.mt-bh>div{background:#F0ECE6;border-radius:4px;height:14px;overflow:hidden}.mt-bh i{display:block;height:100%;background:#2D6A4F;border-radius:4px}.mt-bh b{text-align:right}'+
    '.mt-inf{padding:8px 16px}.mt-inf>div{display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px dashed #EEEAE4;font-size:0.85rem}.mt-inf>div:last-child{border-bottom:none}.mt-inf span{color:#3F3A33}'+
    '.mt-v{white-space:nowrap;text-align:right;flex-shrink:0}.mt-pct{font-style:normal;font-weight:700;font-size:0.78rem;padding:1px 6px;border-radius:999px;margin-left:4px}.mt-pct.mas{background:#DCFCE7;color:#166534}.mt-pct.menos{background:#FEE2E2;color:#B91C1C}.mt-pct.igual{background:#EEEAE4;color:#6B665E}'+
    '@media(max-width:860px){.mt-3col{grid-template-columns:1fr}.mt-2col{grid-template-columns:1fr}.mt-kpis{grid-template-columns:1fr 1fr!important}.mt-prono{grid-template-columns:repeat(4,1fr)}}'+
    '@media(max-width:680px){.mt-sem th:nth-child(3),.mt-sem td:nth-child(3),.mt-sem th:nth-child(4),.mt-sem td:nth-child(4){display:none}.mt-inf>div{flex-direction:column;gap:2px}}';
  document.head.appendChild(st);

  window.ptMetricas = { todos:todos, deIso:deIso, difDias:difDias, ICO:ICO, html:html, entrar:function(){ M.nuevoEv=false; }, datos:function(){ var D=ventasPorDia(); return { D:D, sem:semaforo(D) }; }, iso:iso, hoyIso:hoyIso, sumarDias:sumarDias };
})();
