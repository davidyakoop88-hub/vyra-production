# VYRA:s egna gratisröster (Piper) — en arbetsprocess som server/piper.js startar och pratar med.
#
# Protokollet är JSON, en rad per fråga och en rad per svar, via stdin/stdout:
#   in:  {"id": 7, "model": "/opt/piper-voices/sv_SE-nst-medium.onnx", "text": "hej", "length_scale": 1.0}
#   ut:  {"id": 7, "audio": "<base64 WAV>"}   eller   {"id": 7, "error": "..."}
#
# EN PROCESS SOM LEVER KVAR, inte en per uppläsning: att läsa in en röst tar runt en sekund, och en
# chattstorm hade annars betalat den sekunden för varje rad. Högst två röster hålls i minnet (en
# röst är drygt 100 MB i RAM); den som använts minst nyligen släpps först.
#
# Ingenting skrivs till disk — imagen kör read_only i produktion.
import base64
import io
import json
import sys
import wave

from piper import PiperVoice, SynthesisConfig

MAX_I_MINNET = 2
_roster = {}


def rost(sokvag):
    if sokvag in _roster:
        v = _roster.pop(sokvag)
        _roster[sokvag] = v
        return v
    v = PiperVoice.load(sokvag)
    _roster[sokvag] = v
    while len(_roster) > MAX_I_MINNET:
        _roster.pop(next(iter(_roster)))
    return v


def svara(svar):
    sys.stdout.write(json.dumps(svar) + "\n")
    sys.stdout.flush()


def main():
    for rad in sys.stdin:
        rad = rad.strip()
        if not rad:
            continue
        fraga_id = None
        try:
            fraga = json.loads(rad)
            fraga_id = fraga.get("id")
            langd = float(fraga.get("length_scale") or 1.0)
            langd = min(2.0, max(0.5, langd))
            buf = io.BytesIO()
            with wave.open(buf, "wb") as wav:
                rost(fraga["model"]).synthesize_wav(
                    str(fraga["text"]), wav, syn_config=SynthesisConfig(length_scale=langd)
                )
            data = buf.getvalue()
            if len(data) <= 44:
                raise ValueError("tomt ljud")
            svara({"id": fraga_id, "audio": base64.b64encode(data).decode("ascii")})
        except Exception as fel:  # en trasig fråga får aldrig ta ner processen
            svara({"id": fraga_id, "error": str(fel)[:300]})


if __name__ == "__main__":
    main()
