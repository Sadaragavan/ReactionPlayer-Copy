#!/usr/bin/env bash
# Regenerates the two sample clips used by "Try the demo" (src/assets/demo/).
#
# Both clips carry a burned-in timecode, a sweeping bar and a white flash plus
# a beep at the same *event*, but at different times:
#
#   source.webm    flash at 2.0 s and 8.0 s   (12 s, 16:9)
#   reaction.webm  flash at 3.5 s and 9.5 s   (16 s,  4:3)
#
# So the reaction needs `offsetMs = +1500` to line up with the source — which
# is exactly what the demo session ships with, and what you can recalibrate
# with the offset stepper.
#
# Needs ffmpeg with libvpx-vp9, libopus and drawtext.
set -euo pipefail

OUT="$(cd "$(dirname "$0")/.." && pwd)/src/assets/demo"
FONT="${FONT:-/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf}"
mkdir -p "$OUT"

make_clip() {
  local name="$1" label="$2" size="$3" dur="$4" bg="$5" e1="$6" e2="$7" tone="$8"
  local w="${size%x*}" h="${size#*x}"
  local bar=$((w / 14))

  # 10 fps lower than 24 would not look like video, so keep 24 and spend bits elsewhere.
  ffmpeg -y -hide_banner -loglevel error \
    -f lavfi -i "color=c=${bg}:s=${size}:r=24:d=${dur}" \
    -f lavfi -i "color=c=0xFFD400:s=${bar}x$((h / 9)):r=24:d=${dur}" \
    -f lavfi -i "aevalsrc='0.30*sin(2*PI*880*t)*(between(t,${e1},${e1}+0.12)+between(t,${e2},${e2}+0.12))+0.10*sin(2*PI*${tone}*t)*lt(mod(t,1),0.06)':s=48000:d=${dur}" \
    -filter_complex "
      [0:v][1:v]overlay=x='mod(t*${w}/5,${w}-${bar})':y=${h}*0.46:shortest=1[a];
      [a]drawbox=x=0:y=0:w=iw:h=ih:color=white@0.9:t=fill:enable='between(t,${e1},${e1}+0.12)+between(t,${e2},${e2}+0.12)'[b];
      [b]drawtext=fontfile=${FONT}:text='${label}':x=$((w / 24)):y=$((h / 14)):fontsize=$((h / 11)):fontcolor=0xFFD400[c];
      [c]drawtext=fontfile=${FONT}:text='%{pts\:hms}':x=$((w / 24)):y=h-$((h / 5)):fontsize=$((h / 8)):fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=8[v]" \
    -map "[v]" -map 2:a -t "${dur}" \
    -c:v libvpx-vp9 -b:v 0 -crf 42 -deadline good -cpu-used 4 -g 48 -pix_fmt yuv420p \
    -c:a libopus -b:a 32k \
    "${OUT}/${name}.webm"
  echo "wrote ${OUT}/${name}.webm ($(du -h "${OUT}/${name}.webm" | cut -f1))"
}

make_clip source   "SOURCE"   640x360 12 0x0b2a2f 2.0 8.0 440
make_clip reaction "REACTION" 480x360 16 0x2d0b24 3.5 9.5 330
