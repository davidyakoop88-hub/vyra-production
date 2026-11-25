#!/usr/bin/env bash
# DET PINNADE CJK-TYPSNITTET — samma paket i ci.yml (vakten) och visuell-referenser.yml (bilderna).
#
# Varför typsnittet alls installeras står i ci.yml vid steget 'Visuell · pinnat CJK-typsnitt'.
# Den här filen svarar på en annan fråga: varför det inte längre hämtas från Ubuntus spegel varje gång.
#
# UPPMÄTT 2026-11-23: två körningar av test-visuell (45245383297 försök 2, 45271881368 försök 1)
# föll utan att ett enda prov körts. Paketet är 61 MB, spegeln us-east-2.ec2.archive.ubuntu.com
# började leverera och stannade sedan — och apt väntade tyst tills stegets tak på 15 minuter tog
# slut. Omförsöken i den gamla slingan hann aldrig börja, för det första försöket tog hela taket.
#
# DÄRFÖR:
#   1. .deb-filen ligger i Actions-cachen (~/.cache/vyra-cjk). En cacheträff installerar utan
#      nätverk alls, och det är det vanliga fallet.
#   2. Missar cachen hämtas filen med ett tak PER FÖRSÖK (4 min), så en spegel som stannar ger ett
#      nytt försök i stället för ett rött bygge. Tre försök ryms i stegets 15 minuter.
#   3. Filen kontrolleras (dpkg-deb) innan den sparas, så en avbruten hämtning aldrig cachas.
#
# Bonus som är själva poängen med ordet "pinnat": cachen håller samma byggnad av typsnittet även om
# Ubuntu publicerar en ny. Referensbilderna togs med 1:20240730+repack1-1build1. Byts paketet ska
# det vara ett beslut (byt nyckeln i workflowerna), inte något som händer en tisdag.
set -eu

KAT="${VYRA_CJK_KAT:-$HOME/.cache/vyra-cjk}"
mkdir -p "$KAT"

giltig() { ls "$KAT"/fonts-noto-cjk_*.deb > /dev/null 2>&1 && dpkg-deb --info "$KAT"/fonts-noto-cjk_*.deb > /dev/null 2>&1; }

if giltig; then
  echo "CJK-typsnittet ur cachen: $(basename "$KAT"/fonts-noto-cjk_*.deb)"
else
  for i in 1 2 3; do
    rm -f "$KAT"/*.deb "$KAT"/*.deb.* 2> /dev/null || true
    # apt-get download hämtar paketet även om avbildningen redan har det installerat, och kräver
    # inte root — filen hamnar där kommandot körs.
    if (cd "$KAT" && timeout 240 apt-get download fonts-noto-cjk) && giltig; then
      echo "CJK-typsnittet hämtat: $(basename "$KAT"/fonts-noto-cjk_*.deb)"
      break
    fi
    echo "Försök $i gav upp (spegeln stannade eller filen är trasig) — provar igen om 15 s"
    sudo apt-get update || true
    sleep 15
  done
  giltig || { echo 'CJK-typsnittet gick inte att hämta på tre försök.'; exit 1; }
fi

sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends --allow-downgrades \
  "$KAT"/fonts-noto-cjk_*.deb
fc-cache -f > /dev/null
echo "CJK-typsnitt på plats:"
fc-list | grep -i "noto sans cjk" | head -3
