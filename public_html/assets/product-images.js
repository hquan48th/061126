'use strict';
// Product gallery and square cover editor. Served directly; no build or libraries.
(() => {
  const {escape:e,icon,toast}=Fillico;
  const limit=12;
  const defaults=()=>({zoom:1,offsetX:0,offsetY:0,rotation:0});
  const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
  function normalizeCrop(value){
    const crop=defaults();if(!value||typeof value!=='object')return crop;
    crop.zoom=clamp(Number(value.zoom)||1,1,4);
    crop.offsetX=Number.isFinite(value.offsetX)?value.offsetX:0;
    crop.offsetY=Number.isFinite(value.offsetY)?value.offsetY:0;
    crop.rotation=[0,90,180,270].includes(value.rotation)?value.rotation:0;
    return crop;
  }
  Fillico.productImages=({root,images=[],cover='',source='',crop=null,upload,onBusy=()=>{}})=>{
    let photos=[...new Set(images.filter(url=>typeof url==='string'&&url))];
    let coverUrl=cover||'',coverSource=source||coverUrl,coverCrop=crop?normalizeCrop(crop):null;
    // Preserve a separate legacy cover without exceeding the existing gallery limit.
    if(coverSource&&!photos.includes(coverSource)&&photos.length<limit)photos.unshift(coverSource);
    let busy=false,cropDialog=null,progress='',errors=[],destroyed=false;
    const signal=new AbortController();
    function changed(){root.dispatchEvent(new Event('input',{bubbles:true}));}
    function setBusy(value){busy=value;onBusy(busy||!!cropDialog);render();}
    function render(){
      if(destroyed)return;
      root.innerHTML=`
        <section class="product-media" aria-label="Ảnh sản phẩm">
          <div class="product-media-heading"><div><h3>Ảnh sản phẩm</h3><p>Ảnh bìa gợi ý <strong>1200 × 1200 px · tỷ lệ 1:1</strong>. JPG, PNG hoặc WebP, tối đa 5 MB/ảnh.</p></div><span class="product-media-count">${photos.length}/${limit} ảnh</span></div>
          <input type="hidden" name="image" value="${e(coverUrl)}">
          <div class="product-cover-preview">
            <div class="product-cover-picture">${coverUrl?`<img src="${e(coverUrl)}" alt="Ảnh bìa sản phẩm" data-preview>`:`<div class="product-cover-empty">${icon('image',36)}<span>Chưa có ảnh bìa</span></div>`}</div>
            <div><span class="ad-eyebrow">ẢNH BÌA</span><h4>${coverCrop?'Đã căn chỉnh ảnh bìa':'Chọn ảnh thể hiện rõ sản phẩm'}</h4><p>Ảnh bìa hiển thị đầu tiên tại danh sách và trang chi tiết. Ảnh gốc được giữ để có thể cắt lại.</p>${coverUrl?`<button type="button" class="ad-btn ad-outline" data-crop-current ${busy?'disabled':''}>${icon('crop',17)}<span>Căn chỉnh ảnh bìa</span></button>`:''}</div>
          </div>
          <div class="product-media-upload"><label class="ad-btn ad-outline product-upload-button ${busy?'is-busy':''}">${icon('image',18)}<span>Tải nhiều ảnh</span><input type="file" multiple accept="image/png,image/jpeg,image/webp" data-upload="image" ${busy||photos.length>=limit?'disabled':''}></label><span>Chọn một hoặc nhiều ảnh cùng lúc · tối đa ${limit} ảnh gốc.</span></div>
          <p class="product-media-progress" role="status" ${progress?'':'hidden'}>${e(progress)}</p>
          <div class="product-media-errors" role="alert" ${errors.length?'':'hidden'}>${errors.map(message=>`<p>${e(message)}</p>`).join('')}</div>
          <div class="product-photo-grid">${photos.map((url,index)=>{
            const selected=url===coverSource;
            return `<article class="product-photo ${selected?'is-cover':''}" data-photo-index="${index}"><div class="product-photo-picture"><img src="${e(url)}" alt="Ảnh sản phẩm ${index+1}" loading="lazy">${selected?`<span class="product-photo-badge">${icon('check',14)}Ảnh bìa</span>`:''}</div><div class="product-photo-actions"><button type="button" class="product-photo-cover" data-use-cover="${index}" aria-pressed="${selected}" ${busy||selected?'disabled':''}>${icon(selected?'check':'star',15)}<span>${selected?'Đang làm ảnh bìa':'Đặt làm ảnh bìa'}</span></button><div><button type="button" class="ad-icon" data-crop-photo="${index}" aria-label="Căn chỉnh ảnh ${index+1}" title="Căn chỉnh và dùng làm ảnh bìa" ${busy?'disabled':''}>${icon('crop',17)}</button><button type="button" class="ad-icon" data-remove-photo="${index}" aria-label="Xóa ảnh ${index+1} khỏi sản phẩm" title="Xóa khỏi sản phẩm" ${busy?'disabled':''}>${icon('x',17)}</button></div></div></article>`;
          }).join('')}</div>
          <details class="product-image-links"><summary>Thêm ảnh bằng đường dẫn</summary><div><input type="text" data-image-url placeholder="/images/… hoặc https://…" aria-label="Đường dẫn ảnh bổ sung" ${busy?'disabled':''}><button type="button" class="ad-btn ad-outline" data-add-image-url ${busy?'disabled':''}>${icon('plus',17)}Thêm ảnh</button></div></details>
        </section>`;
    }
    function selectCover(url){if(url===coverSource)return;coverUrl=url;coverSource=url;coverCrop=null;errors=[];changed();render();}
    root.addEventListener('click',event=>{
      if(busy)return;
      const select=event.target.closest('[data-use-cover]');if(select){selectCover(photos[Number(select.dataset.useCover)]);return;}
      const remove=event.target.closest('[data-remove-photo]');if(remove){const index=Number(remove.dataset.removePhoto),removed=photos[index];photos.splice(index,1);if(removed===coverSource){coverUrl=photos[0]||'';coverSource=coverUrl;coverCrop=null;}errors=[];changed();render();return;}
      const cropPhoto=event.target.closest('[data-crop-photo]');if(cropPhoto){void openCrop(photos[Number(cropPhoto.dataset.cropPhoto)]);return;}
      if(event.target.closest('[data-crop-current]')){void openCrop(coverSource||coverUrl);return;}
      if(event.target.closest('[data-add-image-url]')){
        const input=root.querySelector('[data-image-url]'),url=input.value.trim();
        if(photos.length>=limit){errors=['Tối đa 12 ảnh gốc cho mỗi sản phẩm.'];render();return;}
        if(!url||url.includes('..')||!(/^\/(?:images|uploads)\/[A-Za-z0-9_./-]+$/.test(url)||/^https:\/\/[^\s]+$/.test(url))){errors=['Dùng đường dẫn /images/…, /uploads/… hoặc liên kết HTTPS hợp lệ.'];render();return;}
        if(!photos.includes(url))photos.push(url);if(!coverUrl){coverUrl=url;coverSource=url;coverCrop=null;}errors=[];changed();render();
      }
    },{signal:signal.signal});
    root.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.matches('[data-image-url]')){event.preventDefault();root.querySelector('[data-add-image-url]').click();}},{signal:signal.signal});
    root.addEventListener('change',async event=>{
      if(!event.target.matches('[data-upload]')||busy)return;
      const files=Array.from(event.target.files||[]);if(!files.length)return;errors=[];
      if(photos.length+files.length>limit){errors=[`Bạn còn có thể tải ${Math.max(0,limit-photos.length)} ảnh. Tối đa ${limit} ảnh gốc mỗi sản phẩm.`];render();return;}
      for(const file of files){if(!['image/png','image/jpeg','image/webp'].includes(file.type))errors.push(file.name+': chỉ hỗ trợ PNG, JPEG hoặc WebP.');else if(file.size>5*1024*1024)errors.push(file.name+': ảnh vượt quá 5 MB.');}
      if(errors.length){render();return;}
      setBusy(true);let added=0;
      try{
        for(const [index,file] of files.entries()){
          if(destroyed)break;progress=`Đang tải ảnh ${index+1}/${files.length}…`;render();
          try{const url=await upload(file);if(!url)throw new Error('Không nhận được đường dẫn ảnh.');photos.push(url);added++;if(!coverUrl){coverUrl=url;coverSource=url;coverCrop=null;}changed();}
          catch(error){errors.push(file.name+': '+error.message);}
        }
      }finally{progress='';setBusy(false);if(added)toast(`Đã tải ${added} ảnh. Chọn ảnh bìa hoặc căn chỉnh theo ý bạn.`);}
    },{signal:signal.signal});

    async function openCrop(url){
      if(!url||busy||cropDialog)return;
      const state=url===coverSource&&coverCrop?normalizeCrop(coverCrop):defaults();
      const before=document.activeElement,dialog=document.createElement('dialog');cropDialog=dialog;
      dialog.className='php-admin-modal product-crop-dialog admin-root';dialog.setAttribute('aria-label','Căn chỉnh ảnh bìa');
      dialog.innerHTML=`<div class="php-admin-heading"><div><span class="ad-eyebrow">ẢNH BÌA · TỶ LỆ 1:1</span><h2>Căn chỉnh ảnh bìa</h2></div><button type="button" class="ad-icon" data-crop-close aria-label="Đóng căn chỉnh ảnh">${icon('x',21)}</button></div><div class="product-crop-body"><div class="product-crop-stage"><canvas width="800" height="800" tabindex="0" role="img" aria-label="Khung cắt ảnh bìa; kéo để di chuyển, dùng phím mũi tên để căn chỉnh" aria-describedby="crop-instructions" data-crop-canvas></canvas><div class="product-crop-grid" aria-hidden="true"></div><span class="product-crop-loading" role="status">Đang tải ảnh gốc…</span></div><div class="product-crop-controls"><p id="crop-instructions">Kéo ảnh để chọn vị trí. Phóng to bằng thanh trượt hoặc cuộn chuột; dùng phím mũi tên để chỉnh từng chút.</p><label class="product-crop-zoom-label" for="cover-zoom">Phóng to <output data-crop-zoom-value>1×</output></label><input id="cover-zoom" type="range" min="1" max="4" step="0.01" value="${state.zoom}" data-crop-zoom disabled><div class="product-crop-toolbar"><button type="button" class="ad-btn ad-outline" data-crop-rotate disabled>${icon('rotate',17)}Xoay 90°</button><button type="button" class="ad-btn ad-outline" data-crop-reset disabled>${icon('refresh',17)}Đặt lại</button></div><div class="product-crop-dimensions"><p data-crop-dimensions></p><p data-crop-output></p><p class="product-crop-small" data-crop-small hidden>Vùng ảnh đang chọn nhỏ hơn 1200 px. Giảm phóng to hoặc dùng ảnh lớn hơn để ảnh bìa rõ nét.</p></div><p>Ảnh gốc vẫn được giữ trong danh sách ảnh. Bản cắt chỉ được dùng làm ảnh bìa sau khi bạn lưu sản phẩm.</p><p class="ad-error" role="alert" data-crop-error hidden></p></div></div><div class="product-crop-footer"><button type="button" class="ad-btn ad-outline" data-crop-cancel>Hủy</button><button type="button" class="ad-btn ad-primary" data-crop-apply disabled>${icon('check',17)}Dùng làm ảnh bìa</button></div>`;
      document.body.appendChild(dialog);onBusy(true);dialog.showModal();
      const canvas=dialog.querySelector('canvas'),zoom=dialog.querySelector('[data-crop-zoom]'),errorNode=dialog.querySelector('[data-crop-error]');
      let image=null,ready=false,exporting=false,pointer=null;
      function close(){if(exporting)return;dialog.close();dialog.remove();cropDialog=null;onBusy(busy);render();const focus=root.querySelector('[data-crop-current]');if(focus)focus.focus();else if(before?.isConnected)before.focus();}
      function showError(message){errorNode.textContent=message;errorNode.hidden=false;}
      function rotatedSize(){return state.rotation%180?[image.naturalHeight,image.naturalWidth]:[image.naturalWidth,image.naturalHeight];}
      function constrain(){const [w,h]=rotatedSize(),scale=Math.max(800/w,800/h)*state.zoom;state.offsetX=clamp(state.offsetX,-Math.max(0,(w*scale-800)/1600),Math.max(0,(w*scale-800)/1600));state.offsetY=clamp(state.offsetY,-Math.max(0,(h*scale-800)/1600),Math.max(0,(h*scale-800)/1600));}
      function paint(target,side){
        const ctx=target.getContext('2d'),[w,h]=rotatedSize(),scale=Math.max(side/w,side/h)*state.zoom;
        ctx.clearRect(0,0,side,side);ctx.save();ctx.translate(side*(.5+state.offsetX),side*(.5+state.offsetY));ctx.rotate(state.rotation*Math.PI/180);ctx.scale(scale,scale);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(image,-image.naturalWidth/2,-image.naturalHeight/2);ctx.restore();
      }
      function outputSize(){return Math.max(1,Math.min(1200,Math.floor(Math.min(image.naturalWidth,image.naturalHeight)/state.zoom)));}
      function redraw(){
        if(!ready)return;constrain();paint(canvas,800);zoom.value=state.zoom;dialog.querySelector('[data-crop-zoom-value]').textContent=state.zoom.toFixed(2).replace(/0+$/,'').replace(/\.$/,'')+'×';
        const side=outputSize();dialog.querySelector('[data-crop-dimensions]').textContent=`Ảnh gốc: ${image.naturalWidth} × ${image.naturalHeight} px`;
        dialog.querySelector('[data-crop-output]').textContent=`Ảnh bìa sau cắt: ${side} × ${side} px`;
        dialog.querySelector('[data-crop-small]').hidden=side>=1200;
      }
      dialog.querySelector('[data-crop-close]').addEventListener('click',close);dialog.querySelector('[data-crop-cancel]').addEventListener('click',close);
      dialog.addEventListener('cancel',event=>{event.preventDefault();close();});dialog.addEventListener('click',event=>{if(event.target===dialog)close();});
      zoom.addEventListener('input',()=>{state.zoom=Number(zoom.value);redraw();});
      dialog.querySelector('[data-crop-rotate]').addEventListener('click',()=>{state.rotation=(state.rotation+90)%360;state.offsetX=0;state.offsetY=0;redraw();});
      dialog.querySelector('[data-crop-reset]').addEventListener('click',()=>{Object.assign(state,defaults());redraw();});
      canvas.addEventListener('pointerdown',event=>{if(!ready||exporting)return;event.preventDefault();pointer={id:event.pointerId,x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId);canvas.classList.add('is-dragging');canvas.focus();});
      canvas.addEventListener('pointermove',event=>{if(!pointer||pointer.id!==event.pointerId)return;const rect=canvas.getBoundingClientRect();state.offsetX+=(event.clientX-pointer.x)/rect.width;state.offsetY+=(event.clientY-pointer.y)/rect.height;pointer.x=event.clientX;pointer.y=event.clientY;redraw();});
      const stopDrag=()=>{pointer=null;canvas.classList.remove('is-dragging');};canvas.addEventListener('pointerup',stopDrag);canvas.addEventListener('pointercancel',stopDrag);canvas.addEventListener('lostpointercapture',stopDrag);
      canvas.addEventListener('wheel',event=>{if(!ready||exporting)return;event.preventDefault();state.zoom=clamp(state.zoom+(event.deltaY<0 ? 0.08 : -0.08),1,4);redraw();},{passive:false});
      canvas.addEventListener('keydown',event=>{if(!ready||exporting)return;const step=event.shiftKey ? 0.05 : 0.01;if(event.key==='ArrowLeft')state.offsetX-=step;else if(event.key==='ArrowRight')state.offsetX+=step;else if(event.key==='ArrowUp')state.offsetY-=step;else if(event.key==='ArrowDown')state.offsetY+=step;else return;event.preventDefault();redraw();});
      dialog.querySelector('[data-crop-apply]').addEventListener('click',async()=>{
        if(!ready||exporting)return;exporting=true;errorNode.hidden=true;dialog.querySelectorAll('button,input').forEach(el=>{el.disabled=true;});
        try{
          constrain();const output=document.createElement('canvas'),side=outputSize();output.width=side;output.height=side;paint(output,side);
          const blob=await new Promise((resolve,reject)=>{try{output.toBlob(value=>value?resolve(value):reject(new Error('Không thể xuất ảnh bìa.')),'image/webp',.9);}catch(error){reject(error);}});
          const extension=blob.type==='image/webp'?'webp':blob.type==='image/jpeg'?'jpg':'png';
          const croppedUrl=await upload(new File([blob],'anh-bia.'+extension,{type:blob.type}));if(!croppedUrl)throw new Error('Không nhận được ảnh bìa đã cắt.');
          coverUrl=croppedUrl;coverSource=url;coverCrop={...state};changed();exporting=false;close();toast('Đã căn chỉnh ảnh bìa. Bấm Lưu sản phẩm để áp dụng.');
        }catch(error){showError(error.name==='SecurityError'?'Ảnh liên kết này không cho phép cắt. Hãy tải ảnh gốc lên từ máy rồi thử lại.':error.message);exporting=false;dialog.querySelectorAll('button,input').forEach(el=>{el.disabled=false;});}
      });
      try{
        image=new Image();image.crossOrigin='anonymous';
        await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('Không đọc được ảnh gốc. Với ảnh liên kết ngoài, hãy tải file từ máy lên để căn chỉnh.'));image.src=url;});
        if(!dialog.isConnected)return;
        if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth>16000||image.naturalHeight>16000||image.naturalWidth*image.naturalHeight>40000000)throw new Error('Ảnh vượt giới hạn 40 triệu pixel hoặc 16.000 pixel mỗi chiều.');
        ready=true;dialog.querySelector('.product-crop-loading').hidden=true;dialog.querySelectorAll('[data-crop-zoom],[data-crop-rotate],[data-crop-reset],[data-crop-apply]').forEach(el=>{el.disabled=false;});redraw();canvas.focus();
      }catch(error){if(dialog.isConnected){dialog.querySelector('.product-crop-loading').hidden=true;showError(error.message);}}
    }
    render();
    return {
      isBusy:()=>busy||!!cropDialog,
      getValue:()=>({image:coverUrl,images:[...photos],coverSource,coverCrop:coverCrop?{...coverCrop}:null}),
      destroy:()=>{destroyed=true;signal.abort();if(cropDialog){cropDialog.close();cropDialog.remove();cropDialog=null;}}
    };
  };
})();
