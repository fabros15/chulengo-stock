// ═══ Estado de cuenta ═══
// Lista de lo que un cliente encargó, lo que ya pagó y el saldo que le falta.
// Se guarda en este navegador (localStorage) y se descarga como PDF o JPG.
(function(){
  var KEY_CUENTAS = 'chulengo_estados_cuenta';
  var KEY_MARCA = 'chulengo_ec_marca';
  var EC = null;          // cuenta que se está editando
  var ecLogo = '';        // logo en base64 (sale de la marca del presupuesto o se sube acá)

  function peso(n){ return new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(Math.round(n||0)); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function hoyISO(){ var d=new Date(); d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); return d.toISOString().slice(0,10); }
  function fechaAR(iso){ if(!iso) return ''; var p=String(iso).split('-'); return p.length===3 ? p[2]+'/'+p[1]+'/'+p[0] : iso; }
  function num(v){ var n=parseFloat(String(v).replace(/\./g,'').replace(',','.')); return isNaN(n)?0:n; }
  function $(id){ return document.getElementById(id); }

  function cuentaNueva(){
    return { id: 'EC-'+Date.now().toString().slice(-6), cliente:'', fecha: hoyISO(), notas:'',
      secciones:[{ titulo:'', items:[{desc:'',cant:1,precio:0,regalo:false}] }], pagos:[] };
  }

  // ── Cálculos ──
  function totalesSeccion(s, i){
    var total = s.items.reduce(function(a,it){ return a + (it.regalo?0:(num(it.cant)||0)*num(it.precio)); },0);
    var pagos = EC.pagos.filter(function(p){ return String(p.seccion)===String(i); });
    var pagado = pagos.reduce(function(a,p){ return a+num(p.monto); },0);
    return { total: total, pagos: pagos, pagado: pagado, saldo: total-pagado };
  }
  function totalesGenerales(){
    var total=0, pagado=0;
    EC.secciones.forEach(function(s,i){ var t=totalesSeccion(s,i); total+=t.total; });
    EC.pagos.forEach(function(p){ pagado+=num(p.monto); });
    return { total: total, pagado: pagado, saldo: total-pagado };
  }

  // ── Guardado local ──
  function leerCuentas(){ try{ return JSON.parse(localStorage.getItem(KEY_CUENTAS)||'[]'); }catch(e){ return []; } }
  function escribirCuentas(l){ try{ localStorage.setItem(KEY_CUENTAS, JSON.stringify(l)); return true; }catch(e){ alert('No se pudo guardar: '+e.message); return false; } }

  window.ecGuardar = function(silencioso){
    ecLeerFormulario();
    if(!EC.cliente.trim()){ if(!silencioso) alert('Poné el nombre del cliente antes de guardar.'); return false; }
    var l = leerCuentas(), i = l.findIndex(function(c){ return c.id===EC.id; });
    EC.actualizado = Date.now();
    if(i===-1) l.unshift(JSON.parse(JSON.stringify(EC))); else l[i]=JSON.parse(JSON.stringify(EC));
    if(escribirCuentas(l)){ ecRenderGuardadas(); if(!silencioso) ecAviso('Cuenta guardada'); }
    return true;
  };
  window.ecAbrir = function(id){
    var c = leerCuentas().find(function(x){ return x.id===id; }); if(!c) return;
    EC = c; ecRenderFormulario(); ecPreview(); window.scrollTo({top:0,behavior:'smooth'});
  };
  window.ecBorrar = function(id){
    if(!confirm('¿Borrar esta cuenta? No se puede deshacer.')) return;
    escribirCuentas(leerCuentas().filter(function(x){ return x.id!==id; }));
    if(EC && EC.id===id){ EC=cuentaNueva(); ecRenderFormulario(); ecPreview(); }
    ecRenderGuardadas();
  };
  window.ecNueva = function(){ EC = cuentaNueva(); ecRenderFormulario(); ecPreview(); };

  function ecAviso(t){
    var a=$('ec-aviso'); if(!a) return; a.textContent=t; a.style.opacity='1';
    clearTimeout(a._t); a._t=setTimeout(function(){ a.style.opacity='0'; },1800);
  }

  window.ecRenderGuardadas = function(){
    var box=$('ec-guardadas'); if(!box) return;
    var l = leerCuentas();
    if(!l.length){ box.innerHTML='<div class="ec-vacio">Todavía no guardaste ninguna cuenta.</div>'; return; }
    var guardado = EC;
    box.innerHTML = l.map(function(c){
      EC = c; var t = totalesGenerales(); EC = guardado;
      var saldada = t.saldo<=0;
      return '<div class="ec-guardada">'+
        '<div style="min-width:0"><div class="ec-g-nombre">'+esc(c.cliente)+'</div>'+
        '<div class="ec-g-sub">'+esc(fechaAR(c.fecha))+' · Total '+peso(t.total)+'</div></div>'+
        '<div class="ec-g-saldo '+(saldada?'ok':'')+'">'+(saldada?'Saldada':'Debe '+peso(t.saldo))+'</div>'+
        '<div class="ec-g-acc"><button type="button" onclick="ecAbrir(\''+c.id+'\')">Abrir</button>'+
        '<button type="button" class="del" onclick="ecBorrar(\''+c.id+'\')">Borrar</button></div></div>';
    }).join('');
  };

  // ── Formulario ──
  function opcionesSeccion(sel){
    var o='<option value="-1"'+(String(sel)==='-1'?' selected':'')+'>A cuenta general</option>';
    EC.secciones.forEach(function(s,i){ o+='<option value="'+i+'"'+(String(sel)===String(i)?' selected':'')+'>'+esc(s.titulo||('Grupo '+(i+1)))+'</option>'; });
    return o;
  }

  function ecRenderFormulario(){
    $('ec-cliente').value = EC.cliente||'';
    $('ec-fecha').value = EC.fecha||hoyISO();
    $('ec-notas').value = EC.notas||'';
    var h='';
    EC.secciones.forEach(function(s,si){
      h+='<div class="ec-seccion" data-si="'+si+'">'+
        '<div class="ec-sec-head"><input class="ec-in ec-sec-titulo" data-si="'+si+'" placeholder="Nombre del grupo (ej: Liga de Fútbol Femenina)" value="'+esc(s.titulo)+'">'+
        (EC.secciones.length>1?'<button type="button" class="ec-x" title="Quitar grupo" onclick="ecQuitarSeccion('+si+')">✕</button>':'')+'</div>'+
        (s.presupuestoId?'<div style="font-size:0.72rem;color:#2D6A4F;font-weight:600;margin:-4px 0 8px">📄 Viene del presupuesto P-'+esc(String(s.presupuestoId).slice(-6))+'</div>':'')+
        '<div class="ec-item-cab"><span>Descripción</span><span>Cant.</span><span>Precio unit.</span><span>Regalo</span><span></span></div>';
      s.items.forEach(function(it,ii){
        h+='<div class="ec-item">'+
          '<input class="ec-in" data-si="'+si+'" data-ii="'+ii+'" data-k="desc" placeholder="Ej: Trofeo" value="'+esc(it.desc)+'">'+
          '<input class="ec-in" type="number" inputmode="numeric" min="0" data-si="'+si+'" data-ii="'+ii+'" data-k="cant" placeholder="Cant." value="'+esc(it.cant)+'">'+
          '<input class="ec-in" type="number" inputmode="numeric" min="0" data-si="'+si+'" data-ii="'+ii+'" data-k="precio" placeholder="$" value="'+(it.precio?esc(it.precio):'')+'"'+(it.regalo?' disabled':'')+'>'+
          '<label class="ec-regalo"><input type="checkbox" data-si="'+si+'" data-ii="'+ii+'" data-k="regalo"'+(it.regalo?' checked':'')+'>🎁</label>'+
          '<button type="button" class="ec-x" title="Quitar" onclick="ecQuitarItem('+si+','+ii+')">✕</button></div>';
      });
      h+='<button type="button" class="ec-add" onclick="ecAgregarItem('+si+')">+ Agregar producto</button></div>';
    });
    $('ec-secciones').innerHTML = h;

    var p='';
    EC.pagos.forEach(function(pg,pi){
      p+='<div class="ec-pago">'+
        '<input class="ec-in" type="date" data-pi="'+pi+'" data-k="fecha" value="'+esc(pg.fecha)+'">'+
        '<input class="ec-in" type="number" inputmode="numeric" min="0" data-pi="'+pi+'" data-k="monto" placeholder="Monto $" value="'+(pg.monto?esc(pg.monto):'')+'">'+
        '<select class="ec-in" data-pi="'+pi+'" data-k="seccion">'+opcionesSeccion(pg.seccion)+'</select>'+
        '<input class="ec-in ec-pago-det" data-pi="'+pi+'" data-k="detalle" placeholder="Detalle (opcional): transferencia, efectivo..." value="'+esc(pg.detalle)+'">'+
        '<button type="button" class="ec-x" title="Quitar pago" onclick="ecQuitarPago('+pi+')">✕</button></div>';
    });
    $('ec-pagos').innerHTML = p || '<div class="ec-vacio">Sin pagos todavía.</div>';
  }

  function ecLeerFormulario(){
    EC.cliente = $('ec-cliente').value;
    EC.fecha = $('ec-fecha').value;
    EC.notas = $('ec-notas').value;
    document.querySelectorAll('#ec-secciones .ec-sec-titulo').forEach(function(el){ EC.secciones[+el.dataset.si].titulo = el.value; });
    document.querySelectorAll('#ec-secciones [data-ii]').forEach(function(el){
      var it = EC.secciones[+el.dataset.si].items[+el.dataset.ii], k=el.dataset.k;
      if(k==='regalo') it.regalo = el.checked;
      else if(k==='desc') it.desc = el.value;
      else it[k] = el.value==='' ? '' : num(el.value);
    });
    document.querySelectorAll('#ec-pagos [data-pi]').forEach(function(el){
      var pg = EC.pagos[+el.dataset.pi], k=el.dataset.k;
      pg[k] = k==='monto' ? (el.value===''?'':num(el.value)) : el.value;
    });
  }

  window.ecAgregarSeccion = function(){ ecLeerFormulario(); EC.secciones.push({titulo:'',items:[{desc:'',cant:1,precio:0,regalo:false}]}); ecRenderFormulario(); ecPreview(); };
  window.ecQuitarSeccion = function(si){
    ecLeerFormulario();
    if(!confirm('¿Quitar el grupo "'+(EC.secciones[si].titulo||('Grupo '+(si+1)))+'" con todos sus productos?')) return;
    EC.secciones.splice(si,1);
    EC.pagos.forEach(function(p){ var s=+p.seccion; if(s===si) p.seccion=-1; else if(s>si) p.seccion=s-1; });
    ecRenderFormulario(); ecPreview();
  };
  window.ecAgregarItem = function(si){ ecLeerFormulario(); EC.secciones[si].items.push({desc:'',cant:1,precio:0,regalo:false}); ecRenderFormulario(); ecPreview();
    var ins=document.querySelectorAll('#ec-secciones [data-si="'+si+'"][data-k="desc"]'); if(ins.length) ins[ins.length-1].focus(); };
  window.ecQuitarItem = function(si,ii){ ecLeerFormulario(); EC.secciones[si].items.splice(ii,1); if(!EC.secciones[si].items.length) EC.secciones[si].items.push({desc:'',cant:1,precio:0,regalo:false}); ecRenderFormulario(); ecPreview(); };
  window.ecAgregarPago = function(){ ecLeerFormulario(); EC.pagos.push({fecha:hoyISO(), monto:'', seccion: EC.secciones.length===1?0:-1, detalle:''}); ecRenderFormulario(); ecPreview();
    var ins=document.querySelectorAll('#ec-pagos [data-k="monto"]'); if(ins.length) ins[ins.length-1].focus(); };
  window.ecQuitarPago = function(pi){ ecLeerFormulario(); EC.pagos.splice(pi,1); ecRenderFormulario(); ecPreview(); };

  // ── Marca ──
  function leerMarca(){
    var m={};
    try{ m = JSON.parse(localStorage.getItem(KEY_MARCA)||'{}'); }catch(e){}
    var pres={}; try{ pres = JSON.parse(localStorage.getItem('chulengo_marca')||'{}'); }catch(e){}
    return {
      empresa: m.empresa!=null ? m.empresa : (pres.empresa||''),
      tel: m.tel!=null ? m.tel : (typeof telChulengo==='function' ? telChulengo(pres.tel) : (pres.tel||'')),
      web: m.web!=null ? m.web : (pres.web||''),
      color1: m.color1 || pres.color1 || '#1A1814',
      color2: m.color2 || pres.color2 || '#2D6A4F',
      logo: m.logo || pres.logo || ''
    };
  }
  window.ecGuardarMarca = function(){
    var m = { empresa:$('ec-m-empresa').value, tel:$('ec-m-tel').value, web:$('ec-m-web').value,
      color1:$('ec-m-color1').value, color2:$('ec-m-color2').value, logo: ecLogo };
    try{ localStorage.setItem(KEY_MARCA, JSON.stringify(m)); }catch(e){ try{ delete m.logo; localStorage.setItem(KEY_MARCA, JSON.stringify(m)); }catch(e2){} }
    ecPreview();
  };
  window.ecSubirLogo = function(input){
    var f=input.files&&input.files[0]; if(!f) return;
    var r=new FileReader(); r.onload=function(){ ecLogo=r.result; ecGuardarMarca(); }; r.readAsDataURL(f);
  };
  window.ecToggleMarca = function(){
    var c=$('ec-marca-campos'); var abierto = c.style.display!=='none';
    c.style.display = abierto?'none':'block'; $('ec-marca-chev').textContent = abierto?'▾':'▴';
  };
  function cargarMarcaEnForm(){
    var m=leerMarca(); ecLogo=m.logo;
    $('ec-m-empresa').value=m.empresa; $('ec-m-tel').value=m.tel; $('ec-m-web').value=m.web;
    $('ec-m-color1').value=m.color1; $('ec-m-color2').value=m.color2;
  }

  // ── Vista previa (el mismo diseño sale en el PDF y el JPG) ──
  function ecPreview(){
    if(!EC) return;
    var m = { empresa:$('ec-m-empresa').value, tel:$('ec-m-tel').value, web:$('ec-m-web').value,
      color1:$('ec-m-color1').value||'#1A1814', color2:$('ec-m-color2').value||'#2D6A4F', logo: ecLogo };
    var c1=m.color1, c2=m.color2;
    var g = totalesGenerales();
    var h='';
    h+='<div style="position:absolute;top:0;left:0;right:0;height:8px;background:linear-gradient(90deg,'+c1+' 0 65%,'+c2+' 65% 100%)"></div>';
    // Cabecera
    h+='<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px">';
    h+='<div style="display:flex;gap:12px;align-items:center;min-width:0">';
    if(m.logo) h+='<img src="'+m.logo+'" style="width:58px;height:58px;object-fit:contain;border-radius:10px">';
    else if(m.empresa) h+='<div style="width:58px;height:58px;border-radius:10px;background:'+c1+';color:#fff;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:800">'+esc(m.empresa.charAt(0).toUpperCase())+'</div>';
    h+='<div style="min-width:0">'+(m.empresa?'<div style="font-size:20px;font-weight:800;color:'+c1+';line-height:1.15">'+esc(m.empresa)+'</div>':'');
    if(m.tel) h+='<div style="font-size:11.5px;color:#6B665E;margin-top:4px">📞 '+esc(m.tel)+'</div>';
    if(m.web) h+='<div style="font-size:11.5px;color:#6B665E;margin-top:2px">'+esc(m.web)+'</div>';
    h+='</div></div>';
    h+='<div style="text-align:right;flex-shrink:0"><div style="font-size:24px;font-weight:800;color:'+c1+';letter-spacing:0.01em;line-height:1">ESTADO DE CUENTA</div>'+
       '<div style="height:3px;width:44px;background:'+c2+';margin:8px 0 8px auto;border-radius:2px"></div>'+
       '<div style="font-size:11.5px;color:#6B665E">Fecha: <b style="color:#1A1814">'+esc(fechaAR(EC.fecha))+'</b></div></div>';
    h+='</div>';
    // Cliente
    h+='<div style="margin:22px 0 18px;padding:12px 14px;background:#F5F2ED;border-left:4px solid '+c2+';border-radius:6px">'+
       '<div style="font-size:10px;font-weight:700;color:#8A8479;letter-spacing:0.08em">CLIENTE</div>'+
       '<div style="font-size:17px;font-weight:700;margin-top:2px">'+esc(EC.cliente||'—')+'</div></div>';

    // Secciones
    EC.secciones.forEach(function(s,si){
      var t = totalesSeccion(s,si);
      var items = s.items.filter(function(it){ return String(it.desc||'').trim() || num(it.precio); });
      if(!items.length && !s.titulo) return;
      h+='<div style="margin-bottom:18px;border:1px solid #E2DDD6;border-radius:10px;overflow:hidden">';
      h+='<div style="background:'+c1+';color:#fff;padding:9px 14px;font-size:13px;font-weight:700;letter-spacing:0.02em">'+esc(s.titulo||('Grupo '+(si+1)))+'</div>';
      h+='<table style="width:100%;border-collapse:collapse;font-size:12.5px">';
      h+='<tr style="background:#F5F2ED;color:#6B665E;font-size:10px;font-weight:700;letter-spacing:0.06em">'+
         '<td style="padding:7px 14px">DESCRIPCIÓN</td><td style="padding:7px 8px;text-align:center;width:60px">CANT.</td>'+
         '<td style="padding:7px 8px;text-align:right;width:105px">PRECIO UNIT.</td><td style="padding:7px 14px;text-align:right;width:115px">IMPORTE</td></tr>';
      items.forEach(function(it){
        var imp = it.regalo?0:(num(it.cant)||0)*num(it.precio);
        h+='<tr style="border-top:1px solid #EEEAE4">'+
          '<td style="padding:8px 14px">'+esc(it.desc)+(it.regalo?' <span style="display:inline-block;background:#EFF6F1;color:'+c2+';border:1px solid #CBE3D3;border-radius:20px;padding:1px 8px;font-size:10px;font-weight:700;margin-left:4px">REGALO</span>':'')+'</td>'+
          '<td style="padding:8px;text-align:center">'+esc(it.cant)+'</td>'+
          '<td style="padding:8px;text-align:right;color:#6B665E">'+(it.regalo?'—':peso(it.precio))+'</td>'+
          '<td style="padding:8px 14px;text-align:right;font-weight:700">'+(it.regalo?'$ 0':peso(imp))+'</td></tr>';
      });
      h+='</table>';
      // Resumen de la sección
      h+='<div style="border-top:1px solid #E2DDD6;padding:9px 14px;font-size:12.5px;background:#FBFAF8">';
      h+='<div style="display:flex;justify-content:space-between;padding:2px 0"><span style="color:#6B665E">Subtotal</span><b>'+peso(t.total)+'</b></div>';
      t.pagos.forEach(function(p){
        h+='<div style="display:flex;justify-content:space-between;padding:2px 0;color:'+c2+'"><span>Pago '+esc(fechaAR(p.fecha))+(p.detalle?' · '+esc(p.detalle):'')+'</span><b>− '+peso(p.monto)+'</b></div>';
      });
      if(t.pagos.length){
        var ok=t.saldo<=0;
        h+='<div style="display:flex;justify-content:space-between;padding:6px 0 0;margin-top:4px;border-top:1px dashed #D4CFC8;font-size:13.5px"><b>'+(ok?'Saldado':'Falta pagar')+'</b><b style="color:'+(ok?c2:'#B91C1C')+'">'+peso(Math.max(t.saldo,0))+'</b></div>';
      }
      h+='</div></div>';
    });

    // Pagos a cuenta general
    var generales = EC.pagos.filter(function(p){ return String(p.seccion)==='-1' && num(p.monto); });
    if(generales.length){
      h+='<div style="margin-bottom:18px;border:1px solid #CBE3D3;border-radius:10px;padding:10px 14px;background:#F4FAF6;font-size:12.5px">'+
         '<div style="font-size:10px;font-weight:700;color:'+c2+';letter-spacing:0.08em;margin-bottom:4px">PAGOS A CUENTA</div>';
      generales.forEach(function(p){
        h+='<div style="display:flex;justify-content:space-between;padding:2px 0;color:'+c2+'"><span>Pago '+esc(fechaAR(p.fecha))+(p.detalle?' · '+esc(p.detalle):'')+'</span><b>− '+peso(p.monto)+'</b></div>';
      });
      h+='</div>';
    }

    // Resumen general
    var saldada = g.saldo<=0 && g.total>0;
    h+='<div style="display:flex;gap:16px;align-items:stretch;margin-top:6px">';
    h+='<div style="flex:1;font-size:12px;color:#6B665E;display:flex;flex-direction:column;justify-content:flex-end">';
    if(EC.notas) h+='<div style="background:#F5F2ED;border-radius:8px;padding:10px 12px;white-space:pre-wrap;line-height:1.45"><div style="font-size:10px;font-weight:700;color:'+c2+';letter-spacing:0.08em;margin-bottom:3px">NOTAS</div>'+esc(EC.notas)+'</div>';
    h+='</div>';
    h+='<div style="width:270px;flex-shrink:0;font-size:13px">';
    h+='<div style="display:flex;justify-content:space-between;padding:4px 2px"><span style="color:#6B665E">Total</span><b>'+peso(g.total)+'</b></div>';
    h+='<div style="display:flex;justify-content:space-between;padding:4px 2px;color:'+c2+'"><span>Pagado</span><b>− '+peso(g.pagado)+'</b></div>';
    h+='<div style="margin-top:8px;background:'+(saldada?c2:c1)+';color:#fff;border-radius:10px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center">'+
       '<span style="font-size:11px;font-weight:700;letter-spacing:0.08em">'+(saldada?'CUENTA SALDADA':'SALDO PENDIENTE')+'</span>'+
       '<span style="font-size:22px;font-weight:800">'+peso(Math.max(g.saldo,0))+'</span></div>';
    if(g.saldo<0) h+='<div style="font-size:11px;color:'+c2+';text-align:right;margin-top:4px">Saldo a favor del cliente: '+peso(-g.saldo)+'</div>';
    h+='</div></div>';

    // Pie
    h+='<div style="margin-top:26px;padding-top:12px;border-top:1px solid #E2DDD6;font-size:11px;color:#8A8479;display:flex;justify-content:space-between">'+
       '<span>Ante cualquier duda escribinos'+(m.tel?' al '+esc(m.tel):'')+'.</span><span style="font-weight:700;color:'+c1+'">¡Gracias!</span></div>';

    $('ec-doc').innerHTML = h;
    document.querySelectorAll('#ec-pagos select[data-k="seccion"]').forEach(function(sel){
      EC.secciones.forEach(function(sec,i){ var o=sel.querySelector('option[value="'+i+'"]'); if(o) o.textContent=sec.titulo||('Grupo '+(i+1)); });
    });
    ajustarVista();
    var r=$('ec-resumen-rapido');
    if(r) r.innerHTML = 'Total <b>'+peso(g.total)+'</b> · Pagado <b>'+peso(g.pagado)+'</b> · Falta <b style="color:#B91C1C">'+peso(Math.max(g.saldo,0))+'</b>';
  }
  // Achica la vista previa para que entre entera en la pantalla
  function ajustarVista(){
    var w=$('ec-doc-wrap'), d=$('ec-doc'); if(!w||!d||!w.clientWidth) return;
    var disp=w.clientWidth-32, z=Math.min(1, disp/700);
    d.style.zoom = z<1 ? z : '';
  }
  window.ecPreview = function(){ ecLeerFormulario(); ecPreview(); };

  // ── Exportar ──
  function capturar(){
    if(typeof html2canvas!=='function'){ alert('No se pudo cargar el generador de imágenes. Recargá la página.'); return Promise.reject(); }
    ecLeerFormulario(); ecPreview();
    var src=$('ec-doc');
    var host=document.createElement('div');
    host.style.cssText='position:fixed;left:-10000px;top:0;width:700px;background:#fff';
    var clon=src.cloneNode(true); clon.id=''; clon.style.zoom=''; clon.style.boxShadow='none'; clon.style.border='none';
    host.appendChild(clon); document.body.appendChild(host);
    return html2canvas(clon,{scale:2.5,backgroundColor:'#ffffff',useCORS:true,logging:false,windowWidth:700})
      .then(function(cv){ document.body.removeChild(host); return cv; },
            function(e){ document.body.removeChild(host); throw e; });
  }
  function nombreArchivo(ext){
    return 'Estado-de-cuenta-'+(EC.cliente||'cliente').trim().replace(/\s+/g,'-').replace(/[^\w\-áéíóúñÁÉÍÓÚÑ]/g,'')+'-'+(EC.fecha||hoyISO())+'.'+ext;
  }
  function descargar(url, nombre){ var a=document.createElement('a'); a.href=url; a.download=nombre; document.body.appendChild(a); a.click(); a.remove(); }
  function ocupado(btn, on){ if(!btn) return; if(on){ btn._txt=btn.innerHTML; btn.innerHTML='Generando...'; btn.disabled=true; } else { btn.innerHTML=btn._txt; btn.disabled=false; } }

  window.ecDescargarJPG = function(btn){
    ecGuardar(true); ocupado(btn,true);
    capturar().then(function(cv){ descargar(cv.toDataURL('image/jpeg',0.92), nombreArchivo('jpg')); })
      .catch(function(e){ if(e) alert('No se pudo generar la imagen: '+(e.message||e)); })
      .then(function(){ ocupado(btn,false); });
  };
  function armarPDF(cv){
    var jsPDF = window.jspdf&&window.jspdf.jsPDF ? window.jspdf.jsPDF : window.jsPDF;
    if(!jsPDF) throw new Error('no se pudo cargar la librería PDF');
    var doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
    var W=210, H=297, M=8, anchoMM=W-2*M;
    var pxPorMM = cv.width/anchoMM, altoPagPx = Math.floor((H-2*M)*pxPorMM);
    for(var y=0, pag=0; y<cv.height; y+=altoPagPx, pag++){
      var h=Math.min(altoPagPx, cv.height-y);
      var c=document.createElement('canvas'); c.width=cv.width; c.height=h;
      var ctx=c.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,c.width,h); ctx.drawImage(cv,0,y,cv.width,h,0,0,cv.width,h);
      if(pag>0) doc.addPage();
      doc.addImage(c.toDataURL('image/jpeg',0.92),'JPEG',M,M,anchoMM,h/pxPorMM);
    }
    return doc;
  }
  window.ecDescargarPDF = function(btn){
    ecGuardar(true); ocupado(btn,true);
    capturar().then(function(cv){ armarPDF(cv).save(nombreArchivo('pdf')); })
      .catch(function(e){ if(e) alert('No se pudo generar el PDF: '+(e.message||e)); })
      .then(function(){ ocupado(btn,false); });
  };
  window.ecCompartir = function(btn){
    ecGuardar(true); ocupado(btn,true);
    var g=totalesGenerales();
    var texto='Hola'+(EC.cliente?' '+EC.cliente.split(' ')[0]:'')+'! Te paso el estado de cuenta. Total: '+peso(g.total)+' · Pagado: '+peso(g.pagado)+' · *Falta pagar: '+peso(Math.max(g.saldo,0))+'*';
    capturar().then(function(cv){
      return new Promise(function(res){ cv.toBlob(res,'image/jpeg',0.92); }).then(function(blob){
        var file = new File([blob], nombreArchivo('jpg'), {type:'image/jpeg'});
        if(navigator.canShare && navigator.canShare({files:[file]})){
          return navigator.share({files:[file], text:texto}).catch(function(){});
        }
        descargar(URL.createObjectURL(blob), nombreArchivo('jpg'));
        setTimeout(function(){ window.open('https://wa.me/?text='+encodeURIComponent(texto),'_blank'); },400);
      });
    }).catch(function(e){ if(e) alert('No se pudo compartir: '+(e.message||e)); })
      .then(function(){ ocupado(btn,false); });
  };

  // ── Inicio ──
  window.ecInit = function(){
    cargarMarcaEnForm();
    if(!EC) EC = cuentaNueva();
    ecRenderFormulario(); ecPreview(); ecRenderGuardadas();
  };

  document.addEventListener('input', function(e){ if(e.target.closest && e.target.closest('#herramienta-estado-cuenta form, #herramienta-estado-cuenta .ec-form')) { ecLeerFormulario(); ecPreview(); } });
  document.addEventListener('change', function(e){
    if(!e.target.closest || !e.target.closest('#herramienta-estado-cuenta .ec-form')) return;
    if(e.target.dataset && e.target.dataset.k==='regalo'){
      var pr=document.querySelector('#ec-secciones [data-si="'+e.target.dataset.si+'"][data-ii="'+e.target.dataset.ii+'"][data-k="precio"]');
      if(pr) pr.disabled=e.target.checked;
    }
    ecLeerFormulario(); ecPreview();
  });
  window.addEventListener('resize', function(){ ajustarVista(); });

  // ═══ Enlace con los presupuestos ═══
  // Cuando un presupuesto pasa a Aprobado / Señado / Pagado se suma solo
  // al estado de cuenta de ese cliente (un grupo por presupuesto).
  var ACTIVOS = ['Aprobado','Señado','Pagado'];
  function norm(t){ return String(t||'').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' '); }
  function nroPres(id){ return 'P-'+String(id).slice(-6); }
  function itemsDesdePresupuesto(d){
    var items = (d.items&&d.items.length) ? d.items : [{nombre:d.proyecto||'Presupuesto', precio:d.precioTotal||0, cant:d.cantidad||1}];
    var out = items.map(function(it){ var c=num(it.cant)||1; return { desc: it.nombre||'', cant: c, precio: Math.round(num(it.precio)/c), regalo:false }; });
    var suma = out.reduce(function(a,it){ return a+it.cant*it.precio; },0);
    var total = num(d.precioTotal);
    if(total>0 && Math.abs(suma-total)>=1) out.push({desc: total<suma?'Descuento':'Ajuste', cant:1, precio: Math.round(total-suma), regalo:false});
    return out;
  }
  function esVacia(sec){ return !sec.presupuestoId && !String(sec.titulo||'').trim() && sec.items.every(function(it){ return !String(it.desc||'').trim() && !num(it.precio); }); }
  function quitarSeccionDe(c, si){
    c.secciones.splice(si,1);
    c.pagos = c.pagos.filter(function(p){ return +p.seccion!==si; });
    c.pagos.forEach(function(p){ if(+p.seccion>si) p.seccion=+p.seccion-1; });
  }
  function guardarCuentaObj(c){
    c.actualizado = Date.now();
    var l = leerCuentas(), i = l.findIndex(function(x){ return x.id===c.id; });
    if(i===-1) l.unshift(c); else l[i]=c;
    escribirCuentas(l);
    if(EC && EC.id===c.id){ EC = JSON.parse(JSON.stringify(c)); if($('ec-secciones')){ ecRenderFormulario(); ecPreview(); } }
    ecRenderGuardadas();
  }
  function cuentaConPresupuesto(id){
    var l=leerCuentas();
    for(var i=0;i<l.length;i++){ var si=l[i].secciones.findIndex(function(s){ return s.presupuestoId===id; }); if(si!==-1) return {c:l[i], si:si}; }
    return null;
  }
  function saldoSeccion(c, si){
    var guard=EC; EC=c; var t=totalesSeccion(c.secciones[si], si); EC=guard; return t.saldo;
  }

  function avisoEnlace(texto, cuentaId){
    var a=document.getElementById('ec-aviso-enlace');
    if(!a){ a=document.createElement('div'); a.id='ec-aviso-enlace';
      a.style.cssText='position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1A1814;color:#fff;padding:12px 16px;border-radius:12px;font:600 0.85rem Inter,sans-serif;z-index:9999;display:flex;gap:12px;align-items:center;box-shadow:0 8px 30px rgba(0,0,0,0.25);max-width:92vw';
      document.body.appendChild(a); }
    a.innerHTML='<span>'+esc(texto)+'</span>'+(cuentaId?'<button type="button" style="background:#2D6A4F;color:#fff;border:none;border-radius:8px;padding:6px 12px;font:700 0.8rem Inter,sans-serif;cursor:pointer;white-space:nowrap">Ver cuenta</button>':'');
    var b=a.querySelector('button'); if(b) b.onclick=function(){ a.style.display='none'; ecVerCuenta(cuentaId); };
    a.style.display='flex'; clearTimeout(a._t); a._t=setTimeout(function(){ a.style.display='none'; },7000);
  }
  window.ecVerCuenta = function(cuentaId){
    var c=leerCuentas().find(function(x){ return x.id===cuentaId; }); if(!c) return;
    EC=c;
    if(typeof irAHerramienta==='function') irAHerramienta('estado-cuenta'); else { ecRenderFormulario(); ecPreview(); }
  };
  window.ecCuentaDePresupuesto = function(id){ var r=cuentaConPresupuesto(id); return r?r.c:null; };
  window.ecCuentaDeCliente = function(cliente){
    var n=norm(cliente); if(!n) return null;
    return leerCuentas().find(function(c){ return norm(c.cliente)===n; }) || null;
  };

  // Se llama cuando cambia el estado de un presupuesto
  window.ecSincronizarPresupuesto = function(id, d, estado){
    var ya = cuentaConPresupuesto(id);
    if(ACTIVOS.indexOf(estado)===-1){
      if(ya && confirm('Este presupuesto está cargado en el estado de cuenta de '+ya.c.cliente+'. ¿Lo saco de ahí?')){
        quitarSeccionDe(ya.c, ya.si); guardarCuentaObj(ya.c);
        avisoEnlace('Se sacó del estado de cuenta de '+ya.c.cliente, ya.c.id);
      }
      return;
    }
    var c, si, nueva=false;
    if(ya){ c=ya.c; si=ya.si; }
    else {
      var cliente = String(d.cliente||'').trim();
      if(!cliente){ cliente = (prompt('Este presupuesto no tiene cliente. ¿A qué cliente se lo sumo en su estado de cuenta?')||'').trim(); if(!cliente) return; }
      c = ecCuentaDeCliente(cliente);
      if(!c){ c = cuentaNueva(); c.cliente = cliente; c.secciones=[]; nueva=true; }
      c.secciones = c.secciones.filter(function(s){ return !esVacia(s); });
      c.secciones.push({ titulo: d.proyecto||nroPres(id), presupuestoId: id, items: itemsDesdePresupuesto(d) });
      si = c.secciones.length-1;
    }
    var pagosDe = c.pagos.filter(function(p){ return p.presupuestoId===id; });
    if(estado==='Señado' && !pagosDe.length){
      var r = prompt('¿Cuánto dejó de seña? (dejalo vacío si todavía no te pagó nada)', '');
      var monto = num(r||'');
      if(monto>0) c.pagos.push({fecha:hoyISO(), monto:monto, seccion:si, detalle:'Seña', presupuestoId:id});
    }
    if(estado==='Pagado'){
      var saldo = saldoSeccion(c, si);
      if(saldo>0) c.pagos.push({fecha:hoyISO(), monto:saldo, seccion:si, detalle:pagosDe.length?'Saldo':'Pago total', presupuestoId:id});
    }
    guardarCuentaObj(c);
    var sal = saldoSeccion(c, si);
    avisoEnlace((ya?'Estado de cuenta de ':(nueva?'Se creó el estado de cuenta de ':'Se sumó al estado de cuenta de '))+c.cliente+' · falta '+peso(Math.max(sal,0)), c.id);
  };

  // Si se edita un presupuesto que ya está en una cuenta, se actualizan sus productos
  window.ecActualizarDesdePresupuesto = function(id, d){
    var ya = cuentaConPresupuesto(id); if(!ya) return;
    ya.c.secciones[ya.si].items = itemsDesdePresupuesto(d);
    if(d.proyecto) ya.c.secciones[ya.si].titulo = d.proyecto;
    guardarCuentaObj(ya.c);
    avisoEnlace('También se actualizó el estado de cuenta de '+ya.c.cliente, ya.c.id);
  };

  // Desde la herramienta: traer un presupuesto a mano
  window.ecTraerPresupuesto = function(){
    if(!window.currentUser){ alert('Iniciá sesión para ver tus presupuestos.'); return; }
    var mostrar = function(lista){
      var m=document.createElement('div');
      m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:3000;display:flex;align-items:center;justify-content:center;padding:1rem';
      var filas = lista.length ? lista.map(function(e){
        var d=e.data, enCuenta=cuentaConPresupuesto(e.id);
        return '<button type="button" data-id="'+e.id+'" style="display:flex;width:100%;text-align:left;gap:10px;align-items:center;padding:10px 12px;border:1px solid #E2DDD6;border-radius:10px;background:#fff;margin-bottom:6px;cursor:pointer;font-family:Inter,sans-serif">'+
          '<span style="flex:1;min-width:0"><b style="font-size:0.88rem">'+esc(d.proyecto||'Sin nombre')+'</b><br><span style="font-size:0.75rem;color:#8A8479">'+esc(d.cliente||'Sin cliente')+' · '+nroPres(e.id)+' · '+esc(d.estado||'Enviado')+(enCuenta?' · ya en cuenta de '+esc(enCuenta.c.cliente):'')+'</span></span>'+
          '<b style="font-size:0.85rem;color:#2D6A4F;white-space:nowrap">'+peso(d.precioTotal)+'</b></button>';
      }).join('') : '<div class="ec-vacio">No tenés presupuestos guardados.</div>';
      m.innerHTML='<div style="background:#fff;border-radius:16px;padding:1.25rem;max-width:480px;width:100%;max-height:80vh;overflow:auto;font-family:Inter,sans-serif">'+
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem"><b>Elegí un presupuesto</b><button type="button" data-cerrar style="background:none;border:none;font-size:1rem;cursor:pointer">✕</button></div>'+filas+'</div>';
      m.addEventListener('click', function(ev){
        if(ev.target===m || ev.target.closest('[data-cerrar]')){ m.remove(); return; }
        var b=ev.target.closest('[data-id]'); if(!b) return;
        var e=lista.find(function(x){ return x.id===b.dataset.id; }); m.remove(); if(!e) return;
        var otra=cuentaConPresupuesto(e.id);
        if(otra && otra.c.id!==EC.id){ alert('Ese presupuesto ya está en el estado de cuenta de '+otra.c.cliente+'.'); return; }
        if(otra){ alert('Ese presupuesto ya está en esta cuenta.'); return; }
        ecLeerFormulario();
        if(!EC.cliente.trim()) EC.cliente = e.data.cliente||'';
        EC.secciones = EC.secciones.filter(function(s){ return !esVacia(s); });
        EC.secciones.push({ titulo: e.data.proyecto||nroPres(e.id), presupuestoId: e.id, items: itemsDesdePresupuesto(e.data) });
        ecRenderFormulario(); ecPreview(); ecGuardar(true);
      });
      document.body.appendChild(m);
    };
    if(typeof todosPresupuestos!=='undefined' && todosPresupuestos.length){ mostrar(todosPresupuestos); return; }
    firebase.firestore().collection('presupuestos').where('uid','==',window.currentUser.uid).get().then(function(snap){
      var ms=function(d){ return d.fecha && d.fecha.toMillis ? d.fecha.toMillis() : Date.now(); };
      var l=snap.docs.map(function(x){ return {id:x.id, data:x.data()}; }).sort(function(a,b){ return ms(b.data)-ms(a.data); });
      if(typeof todosPresupuestos!=='undefined') todosPresupuestos=l;
      mostrar(l);
    }).catch(function(e){ alert('No se pudieron cargar los presupuestos: '+e.message); });
  };
})();
