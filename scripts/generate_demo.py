"""Generate original, non-copyrighted demo tracks; not needed to run the app."""
import math, wave, subprocess, tempfile
from pathlib import Path
import numpy as np

OUT=Path(__file__).resolve().parents[1]/'src/main/resources/web/demo'
OUT.mkdir(parents=True,exist_ok=True)
SAMPLE_RATE=24000
SONGS={
 'aether-bloom':{'seconds':24,'chords':[(57,60,64,69),(52,55,59,64),(53,57,60,65),(55,59,62,67)],'melody':[69,72,76,72,69,67,64,67,69,72,76,79,77,74,72,69]},
 'quiet-constellations':{'seconds':22,'chords':[(48,55,60,64),(50,57,62,65),(53,60,65,69),(48,55,60,67)],'melody':[72,74,76,72,67,69,72,69,65,67,72,74,76,79,76,72]},
 'afterglow':{'seconds':26,'chords':[(55,59,62,67),(57,60,64,69),(52,57,59,64),(53,60,64,69)],'melody':[67,69,71,74,76,74,71,67,69,72,76,79,76,74,72,69]}
}

def freq(note):return 440*2**((note-69)/12)
def synth(notes,melody,seconds):
    n=int(seconds*SAMPLE_RATE);t=np.arange(n,dtype=np.float64)/SAMPLE_RATE
    out=np.zeros(n,dtype=np.float64)
    for k,chord in enumerate(notes):
        start=k*seconds/4;end=(k+1)*seconds/4;ids=np.where((t>=start)&(t<end))[0];local=t[ids]-start
        gate=np.minimum(1,local/1.2)*np.minimum(1,(end-t[ids])/.9)
        for note in chord:
            f=freq(note);out[ids]+=(np.sin(2*np.pi*f*local)+.25*np.sin(2*np.pi*f*2*local))*.044*gate
    beats=seconds/len(melody)
    for i,note in enumerate(melody):
        start=i*beats;ids=np.where((t>=start)&(t<start+beats*1.1))[0]
        loc=t[ids]-start
        env=(1-np.exp(-loc*40))*np.exp(-loc/(beats*.53))
        f=freq(note);out[ids]+=(np.sin(2*np.pi*f*loc)+.30*np.sin(2*np.pi*2*f*loc)+.13*np.sin(2*np.pi*3*f*loc))*.18*env
    delay=int(.22*SAMPLE_RATE);out[delay:]+=out[:-delay]*.18
    delay2=int(.48*SAMPLE_RATE);out[delay2:]+=out[:-delay2]*.12
    out=np.tanh(out*2.2)*.7
    envelope=np.minimum(1,t/1.0)*np.minimum(1,(seconds-t)/1.5)
    return (np.clip(out*envelope,-1,1)*32767).astype(np.int16)

for name,settings in SONGS.items():
    pcm=synth(settings['chords'],settings['melody'],settings['seconds'])
    with tempfile.NamedTemporaryFile(suffix='.wav') as temp:
        with wave.open(temp.name,'wb') as w:
            w.setnchannels(1);w.setsampwidth(2);w.setframerate(SAMPLE_RATE);w.writeframes(pcm.tobytes())
        subprocess.run(['ffmpeg','-loglevel','error','-y','-i',temp.name,'-codec:a','libmp3lame','-b:a','80k',str(OUT/f'{name}.mp3')],check=True)
    print(f'{name}: {(OUT/f"{name}.mp3").stat().st_size//1024} KiB')
