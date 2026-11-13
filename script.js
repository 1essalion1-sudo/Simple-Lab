import { Input, ALL_FORMATS, BlobSource, Output, BufferTarget, Mp3OutputFormat, canEncodeAudio, Conversion } from "mediabunny";
import { registerMp3Encoder } from "@mediabunny/mp3-encoder";

const $=id=>document.getElementById(id);
function status(el,msg,error=false){el.textContent=msg;el.classList.toggle('error',error);el.style.display='block'}
function clearStatus(el){el.style.display='none';el.textContent=''}
function cleanName(s,fallback){return (s||'').trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g,'-').replace(/\s+/g,'-').slice(0,80)||fallback}
function humanSize(n){if(n<1024)return n+' B';if(n<1048576)return (n/1024).toFixed(1)+' KB';return (n/1048576).toFixed(2)+' MB'}
function showTool(which){const meta=which==='meta';$('metaPanel').classList.toggle('hidden',!meta);$('audioPanel').classList.toggle('hidden',meta);$('tabMeta').classList.toggle('active',meta);$('tabAudio').classList.toggle('active',!meta)}
$('tabMeta').onclick=()=>showTool('meta');$('tabAudio').onclick=()=>showTool('audio');

let imageFile=null,imageUrl=null;
$('imageInput').addEventListener('change',e=>{
 imageFile=e.target.files[0]||null;clearStatus($('metaStatus'));
 if(!imageFile)return;
 if(!/^image\/(jpeg|png|webp)$/.test(imageFile.type)){status($('metaStatus'),'Please choose a JPG, PNG or WebP image.',true);imageFile=null;return}
 imageUrl=URL.createObjectURL(imageFile);$('imageView').src=imageUrl;$('imagePreview').style.display='block';$('imageInfo').textContent=imageFile.name+' · '+humanSize(imageFile.size);$('eraseBtn').disabled=false;
});
$('eraseBtn').onclick=()=>{
 if(!imageFile)return;
 const img=new Image();
 img.onload=()=>{
  try{
   const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
   const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
   const mime=imageFile.type==='image/png'?'image/png':imageFile.type==='image/webp'?'image/webp':'image/jpeg';
   canvas.toBlob(blob=>{
    if(!blob){status($('metaStatus'),'Could not export this image. Try another file.',true);return}
    const ext=mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg';
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=cleanName(imageFile.name.replace(/\.[^.]+$/,''),'image')+'-clean.'+ext;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
    status($('metaStatus'),'Done! A clean copy was created and downloaded. Your original image was left unchanged.');
   },mime,mime==='image/jpeg'?0.94:undefined);
  }catch(e){status($('metaStatus'),'Could not process this image in the browser.',true)}
 };
 img.onerror=()=>status($('metaStatus'),'This image could not be opened.',true);img.src=imageUrl;
};
$('clearImage').onclick=()=>{imageFile=null;$('imageInput').value='';$('imageView').removeAttribute('src');$('imagePreview').style.display='none';$('imageInfo').textContent='No image selected';$('eraseBtn').disabled=true;clearStatus($('metaStatus'));if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl=null};

let videoFile=null,videoUrl=null,recording=false;
$('videoInput').addEventListener('change',e=>{
 videoFile=e.target.files[0]||null;clearStatus($('audioStatus'));
 if(!videoFile)return;
 if(!videoFile.type.startsWith('video/')){status($('audioStatus'),'Please choose a video file.',true);videoFile=null;return}
 if(videoUrl)URL.revokeObjectURL(videoUrl);videoUrl=URL.createObjectURL(videoFile);
 $('videoView').src=videoUrl;$('videoPreview').style.display='block';$('videoInfo').textContent=videoFile.name+' · '+humanSize(videoFile.size);$('convertBtn').disabled=false;
});

// Local conversion pipeline: Mediabunny demuxes/decodes the source,
// then its MP3 output encoder writes an audio-only MP3 file.
let mp3EncoderReady = false;
async function convertVideoToMP3(file){
 if(!mp3EncoderReady){
  if(!(await canEncodeAudio('mp3'))) registerMp3Encoder();
  mp3EncoderReady = true;
 }
 const input = new Input({
  source: new BlobSource(file),
  formats: ALL_FORMATS
 });
 const target = new BufferTarget();
 const output = new Output({
  format: new Mp3OutputFormat(),
  target
 });
 try{
  const conversion = await Conversion.init({input,output});
  if(!conversion.isValid){
   const reasons = (conversion.discardedTracks||[]).map(x=>x.reason).filter(Boolean);
   throw new Error(reasons[0] || 'This video does not contain audio that can be converted.');
  }
  conversion.onProgress = progress => {
   const pct = Math.max(0,Math.min(99,Math.round(progress*100)));
   $('progressBar').style.width=pct+'%';
   $('convertBtn').textContent='Converting… '+pct+'%';
  };
  await conversion.execute();
  if(!target.buffer || !target.buffer.byteLength) throw new Error('No audio was found in this video.');
  return new Blob([target.buffer],{type:'audio/mpeg'});
 }finally{
  try{input.dispose()}catch(e){}
 }
}
$('convertBtn').onclick=async()=>{
 if(!videoFile||recording)return;
 recording=true;$('convertBtn').disabled=true;$('convertBtn').textContent='Loading conversion engine…';
 clearStatus($('audioStatus'));$('progress').style.display='block';$('progressBar').style.width='0%';
 try{
  const blob=await convertVideoToMP3(videoFile);
  if(!blob.size)throw new Error('No audio was found in this video.');
  const filename=cleanName($('audioName').value,'extracted-audio')+'.mp3';
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),15000);
  $('progressBar').style.width='100%';
  status($('audioStatus'),'Finished! Downloaded '+filename+' ('+humanSize(blob.size)+').');
 }catch(err){
  status($('audioStatus'),err.message||'Conversion failed. Try another browser or a smaller video.',true);
 }finally{
  recording=false;$('convertBtn').disabled=!videoFile;$('convertBtn').textContent='Convert video to MP3';
  setTimeout(()=>$('progress').style.display='none',2200);
 }
};
$('clearVideo').onclick=()=>{if(recording)return;videoFile=null;$('videoInput').value='';$('videoView').pause();$('videoView').removeAttribute('src');$('videoView').load();$('videoPreview').style.display='none';$('videoInfo').textContent='No video selected';$('convertBtn').disabled=true;clearStatus($('audioStatus'));$('progress').style.display='none';if(videoUrl)URL.revokeObjectURL(videoUrl);videoUrl=null};
function setupDrop(zone,input){zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('drag')});zone.addEventListener('dragleave',()=>zone.classList.remove('drag'));zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('drag');const f=e.dataTransfer.files[0];if(f){const dt=new DataTransfer();dt.items.add(f);input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}))}})}
setupDrop($('imageDrop'),$('imageInput'));setupDrop($('videoDrop'),$('videoInput'));