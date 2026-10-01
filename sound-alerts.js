// Sound Alerts — bibliotek med ljudklipp som kan kopplas till events.
//
// TRE KÄLLOR, OCH DE ÄR INTE LIKVÄRDIGA:
//   kenney.nl   CC0 (public domain). Inga villkor alls. Massan ligger här.
//   mixkit.co   Mixkit License      ─┐ royaltyfria och tillåtna kommersiellt, men BÅDA förbjuder
//   pixabay.com Pixabay Content Lic. ─┘ att innehållet distribueras "standalone", dvs i oförändrad
//                                       form utan att någon kreativ insats lagts till.
//
// Den sista raden är värd att läsa en gång till innan någon lägger till hundra klipp från Mixkit
// eller Pixabay: ett bibliotek där kunden bläddrar bland oförändrade ljudklipp i en betald produkt
// ligger nära den gränsen. Nya klipp i mängd hör därför hemma under CC0. Pixabay och Mixkit står
// kvar för enstaka karaktärsljud som inte finns CC0 — airhorn, publikreaktioner och liknande.
const soundAlerts={
  followCheer:{id:'followCheer',name:'Follow Cheer',path:'assets/sounds/mixkit/follow-cheer.mp3'},
  giftCoinWin:{id:'giftCoinWin',name:'Gift Coin Win',path:'assets/sounds/mixkit/gift-coin-win.mp3'},
  positiveNotification:{id:'positiveNotification',name:'Positive Notification',path:'assets/sounds/mixkit/achievement.mp3'},
  memberBells:{id:'memberBells',name:'Member Bells',path:'assets/sounds/mixkit/member-bells.mp3'},
  alertBell:{id:'alertBell',name:'Alert Bell',path:'assets/sounds/mixkit/alert-bell.mp3'},
  arcadeWin:{id:'arcadeWin',name:'Arcade Win',path:'assets/sounds/mixkit/arcade-win.mp3'},
  pewPew:{id:'pewPew',name:'Pew Pew',path:'assets/sounds/mixkit/pew-pew.mp3'},
  thankYou:{id:'thankYou',name:'Thank You',path:'assets/sounds/mixkit/thank-you.mp3'},
  iLoveYou:{id:'iLoveYou',name:'I Love You',path:'assets/sounds/pixabay/i-love-you.mp3'},
  jackpot:{id:'jackpot',name:'Jackpot',path:'assets/sounds/mixkit/jackpot.mp3'},
  achievement:{id:'achievement',name:'Achievement',path:'assets/sounds/mixkit/achievement.mp3'},
  victoryCheer:{id:'victoryCheer',name:'Victory Cheer',path:'assets/sounds/mixkit/victory-cheer.mp3'},
  fanfare:{id:'fanfare',name:'Fanfare',path:'assets/sounds/mixkit/fanfare.mp3'},
  djAirhorn:{id:'djAirhorn',name:'DJ Airhorn',path:'assets/sounds/pixabay/dj-airhorn.mp3'}
,
  pixabayBoing2:{id:'pixabayBoing2',name:"Boing 2",path:'assets/sounds/pixabay/boing-2.mp3'},
  pixabayBoingBoingBounce:{id:'pixabayBoingBoingBounce',name:"Boing Boing Bounce",path:'assets/sounds/pixabay/boing-boing-bounce.mp3'},
  pixabayBoingCartoonSpring:{id:'pixabayBoingCartoonSpring',name:"Boing Cartoon Spring",path:'assets/sounds/pixabay/boing-cartoon-spring.mp3'},
  pixabayBoingFunnyWobble:{id:'pixabayBoingFunnyWobble',name:"Boing Funny Wobble",path:'assets/sounds/pixabay/boing-funny-wobble.mp3'},
  pixabayBoing:{id:'pixabayBoing',name:"Boing",path:'assets/sounds/pixabay/boing.mp3'},
  pixabayBubblePop:{id:'pixabayBubblePop',name:"Bubble Pop",path:'assets/sounds/pixabay/bubble-pop.mp3'},
  pixabayCartoonJump2:{id:'pixabayCartoonJump2',name:"Cartoon Jump 2",path:'assets/sounds/pixabay/cartoon-jump-2.mp3'},
  pixabayCartoonJump:{id:'pixabayCartoonJump',name:"Cartoon Jump",path:'assets/sounds/pixabay/cartoon-jump.mp3'},
  pixabayCartoonYoink:{id:'pixabayCartoonYoink',name:"Cartoon Yoink",path:'assets/sounds/pixabay/cartoon-yoink.mp3'},
  pixabayCoinFlip:{id:'pixabayCoinFlip',name:"Coin Flip",path:'assets/sounds/pixabay/coin-flip.mp3'},
  pixabayCoinReceived:{id:'pixabayCoinReceived',name:"Coin Received",path:'assets/sounds/pixabay/coin-received.mp3'},
  pixabayCoin:{id:'pixabayCoin',name:"Coin",path:'assets/sounds/pixabay/coin.mp3'},
  pixabayDingCartoon:{id:'pixabayDingCartoon',name:"Ding Cartoon",path:'assets/sounds/pixabay/ding-cartoon.mp3'},
  pixabayDuckQuack:{id:'pixabayDuckQuack',name:"Duck Quack",path:'assets/sounds/pixabay/duck-quack.mp3'},
  pixabayDuckQuacking:{id:'pixabayDuckQuacking',name:"Duck Quacking",path:'assets/sounds/pixabay/duck-quacking.mp3'},
  pixabayCashRegisterKaching2:{id:'pixabayCashRegisterKaching2',name:"Cash Register Kaching 2",path:'assets/sounds/pixabay/cash-register-kaching-2.mp3'},
  pixabayCashRegisterKaching:{id:'pixabayCashRegisterKaching',name:"Cash Register Kaching",path:'assets/sounds/pixabay/cash-register-kaching.mp3'},
  pixabayChaChingMoneyReceived:{id:'pixabayChaChingMoneyReceived',name:"Cha Ching Money Received",path:'assets/sounds/pixabay/cha-ching-money-received.mp3'},
  pixabayChaChingNewPurchase:{id:'pixabayChaChingNewPurchase',name:"Cha Ching New Purchase",path:'assets/sounds/pixabay/cha-ching-new-purchase.mp3'},
  pixabayChaChingRegister:{id:'pixabayChaChingRegister',name:"Cha Ching Register",path:'assets/sounds/pixabay/cha-ching-register.mp3'},
  pixabayChaChing:{id:'pixabayChaChing',name:"Cha Ching",path:'assets/sounds/pixabay/cha-ching.mp3'},
  pixabayGiftConfetti:{id:'pixabayGiftConfetti',name:"Gift Confetti",path:'assets/sounds/pixabay/gift-confetti.mp3'},
  pixabayLevelUp2:{id:'pixabayLevelUp2',name:"Level Up 2",path:'assets/sounds/pixabay/level-up-2.mp3'},
  pixabayLevelUpRetro:{id:'pixabayLevelUpRetro',name:"Level Up Retro",path:'assets/sounds/pixabay/level-up-retro.mp3'},
  pixabayLevelUp:{id:'pixabayLevelUp',name:"Level Up",path:'assets/sounds/pixabay/level-up.mp3'},
  pixabayMagicSurprise:{id:'pixabayMagicSurprise',name:"Magic Surprise",path:'assets/sounds/pixabay/magic-surprise.mp3'},
  pixabayMagicTwinkle:{id:'pixabayMagicTwinkle',name:"Magic Twinkle",path:'assets/sounds/pixabay/magic-twinkle.mp3'},
  pixabayWooHoo:{id:'pixabayWooHoo',name:"Woo Hoo",path:'assets/sounds/pixabay/woo-hoo.mp3'},
  pixabayYay:{id:'pixabayYay',name:"Yay",path:'assets/sounds/pixabay/yay.mp3'},
  pixabayYipee:{id:'pixabayYipee',name:"Yipee",path:'assets/sounds/pixabay/yipee.mp3'},
  pixabayYippee:{id:'pixabayYippee',name:"Yippee",path:'assets/sounds/pixabay/yippee.mp3'},
  pixabayGunPewPewTwo:{id:'pixabayGunPewPewTwo',name:"Gun Pew Pew Two",path:'assets/sounds/pixabay/gun-pew-pew-two.mp3'},
  pixabayILoveYouCute:{id:'pixabayILoveYouCute',name:"I Love You Cute",path:'assets/sounds/pixabay/i-love-you-cute.mp3'},
  pixabayLaserGunPewPew:{id:'pixabayLaserGunPewPew',name:"Laser Gun Pew Pew",path:'assets/sounds/pixabay/laser-gun-pew-pew.mp3'},
  pixabayPewPewPewGun:{id:'pixabayPewPewPewGun',name:"Pew Pew Pew Gun",path:'assets/sounds/pixabay/pew-pew-pew-gun.mp3'},
  pixabayPewPewTwo:{id:'pixabayPewPewTwo',name:"Pew Pew Two",path:'assets/sounds/pixabay/pew-pew-two.mp3'},
  pixabayPewPew:{id:'pixabayPewPew',name:"Pew Pew 2",path:'assets/sounds/pixabay/pew-pew.mp3'},
  pixabayPop2:{id:'pixabayPop2',name:"Pop 2",path:'assets/sounds/pixabay/pop-2.mp3'},
  pixabayPopCartoon:{id:'pixabayPopCartoon',name:"Pop Cartoon",path:'assets/sounds/pixabay/pop-cartoon.mp3'},
  pixabayPop:{id:'pixabayPop',name:"Pop",path:'assets/sounds/pixabay/pop.mp3'},
  pixabayBabyLaughFunny:{id:'pixabayBabyLaughFunny',name:"Baby Laugh Funny",path:'assets/sounds/pixabay/baby-laugh-funny.mp3'},
  pixabayChildGiggle:{id:'pixabayChildGiggle',name:"Child Giggle",path:'assets/sounds/pixabay/child-giggle.mp3'},
  pixabayCuteGiggle:{id:'pixabayCuteGiggle',name:"Cute Giggle",path:'assets/sounds/pixabay/cute-giggle.mp3'},
  pixabayFunnyChildLaughter:{id:'pixabayFunnyChildLaughter',name:"Funny Child Laughter",path:'assets/sounds/pixabay/funny-child-laughter.mp3'},
  pixabayGirlGiggle:{id:'pixabayGirlGiggle',name:"Girl Giggle",path:'assets/sounds/pixabay/girl-giggle.mp3'},
  pixabayKidsLaugh:{id:'pixabayKidsLaugh',name:"Kids Laugh",path:'assets/sounds/pixabay/kids-laugh.mp3'},
  pixabayToddlerLaughing:{id:'pixabayToddlerLaughing',name:"Toddler Laughing",path:'assets/sounds/pixabay/toddler-laughing.mp3'},
  pixabayTadaFanfare:{id:'pixabayTadaFanfare',name:"Tada Fanfare",path:'assets/sounds/pixabay/tada-fanfare.mp3'},
  pixabayTada:{id:'pixabayTada',name:"Tada",path:'assets/sounds/pixabay/tada.mp3'},
  pixabayWowMale:{id:'pixabayWowMale',name:"Wow Male",path:'assets/sounds/pixabay/wow-male.mp3'},
  pixabayWow:{id:'pixabayWow',name:"Wow",path:'assets/sounds/pixabay/wow.mp3'},
  mixkitArcadeMechanicalBling:{id:'mixkitArcadeMechanicalBling',name:"Arcade Mechanical Bling",path:'assets/sounds/mixkit/arcade-mechanical-bling.mp3'},
  mixkitBellChristmasMagicHit:{id:'mixkitBellChristmasMagicHit',name:"Bell Christmas Magic Hit",path:'assets/sounds/mixkit/bell-christmas-magic-hit.mp3'},
  mixkitBellCookingDing:{id:'mixkitBellCookingDing',name:"Bell Cooking Ding",path:'assets/sounds/mixkit/bell-cooking-ding.mp3'},
  mixkitBellDingDong:{id:'mixkitBellDingDong',name:"Bell Ding Dong",path:'assets/sounds/mixkit/bell-ding-dong.mp3'},
  mixkitBellHappyAlert:{id:'mixkitBellHappyAlert',name:"Bell Happy Alert",path:'assets/sounds/mixkit/bell-happy-alert.mp3'},
  mixkitBellHappyNotification:{id:'mixkitBellHappyNotification',name:"Bell Happy Notification",path:'assets/sounds/mixkit/bell-happy-notification.mp3'},
  mixkitBellMagical:{id:'mixkitBellMagical',name:"Bell Magical",path:'assets/sounds/mixkit/bell-magical.mp3'},
  mixkitBellNotification:{id:'mixkitBellNotification',name:"Bell Notification",path:'assets/sounds/mixkit/bell-notification.mp3'},
  mixkitBellRelaxingChime:{id:'mixkitBellRelaxingChime',name:"Bell Relaxing Chime",path:'assets/sounds/mixkit/bell-relaxing-chime.mp3'},
  mixkitBellService:{id:'mixkitBellService',name:"Bell Service",path:'assets/sounds/mixkit/bell-service.mp3'},
  mixkitBellUpliftingNotification:{id:'mixkitBellUpliftingNotification',name:"Bell Uplifting Notification",path:'assets/sounds/mixkit/bell-uplifting-notification.mp3'},
  mixkitBonusEarned:{id:'mixkitBonusEarned',name:"Bonus Earned",path:'assets/sounds/mixkit/bonus-earned.mp3'},
  mixkitCartoonBoingHit:{id:'mixkitCartoonBoingHit',name:"Cartoon Boing Hit",path:'assets/sounds/mixkit/cartoon-boing-hit.mp3'},
  mixkitCartoonClownHorn:{id:'mixkitCartoonClownHorn',name:"Cartoon Clown Horn",path:'assets/sounds/mixkit/cartoon-clown-horn.mp3'},
  mixkitCartoonDazzleHitBirds:{id:'mixkitCartoonDazzleHitBirds',name:"Cartoon Dazzle Hit Birds",path:'assets/sounds/mixkit/cartoon-dazzle-hit-birds.mp3'},
  mixkitCartoonFart:{id:'mixkitCartoonFart',name:"Cartoon Fart",path:'assets/sounds/mixkit/cartoon-fart.mp3'},
  mixkitCartoonFriendlyKiss:{id:'mixkitCartoonFriendlyKiss',name:"Cartoon Friendly Kiss",path:'assets/sounds/mixkit/cartoon-friendly-kiss.mp3'},
  mixkitCartoonFunnyGiggling:{id:'mixkitCartoonFunnyGiggling',name:"Cartoon Funny Giggling",path:'assets/sounds/mixkit/cartoon-funny-giggling.mp3'},
  mixkitCartoonFunnySlide:{id:'mixkitCartoonFunnySlide',name:"Cartoon Funny Slide",path:'assets/sounds/mixkit/cartoon-funny-slide.mp3'},
  mixkitCartoonFunnySplat:{id:'mixkitCartoonFunnySplat',name:"Cartoon Funny Splat",path:'assets/sounds/mixkit/cartoon-funny-splat.mp3'},
  mixkitCartoonHardPopClick:{id:'mixkitCartoonHardPopClick',name:"Cartoon Hard Pop Click",path:'assets/sounds/mixkit/cartoon-hard-pop-click.mp3'},
  mixkitCartoonLaughVoice:{id:'mixkitCartoonLaughVoice',name:"Cartoon Laugh Voice",path:'assets/sounds/mixkit/cartoon-laugh-voice.mp3'},
  mixkitCartoonLaughingCreature:{id:'mixkitCartoonLaughingCreature',name:"Cartoon Laughing Creature",path:'assets/sounds/mixkit/cartoon-laughing-creature.mp3'},
  mixkitCartoonMonkeyGiggling:{id:'mixkitCartoonMonkeyGiggling',name:"Cartoon Monkey Giggling",path:'assets/sounds/mixkit/cartoon-monkey-giggling.mp3'},
  mixkitCartoonQuickKiss:{id:'mixkitCartoonQuickKiss',name:"Cartoon Quick Kiss",path:'assets/sounds/mixkit/cartoon-quick-kiss.mp3'},
  mixkitCartoonToyWhistle:{id:'mixkitCartoonToyWhistle',name:"Cartoon Toy Whistle",path:'assets/sounds/mixkit/cartoon-toy-whistle.mp3'},
  mixkitCartoonVoiceLaugh:{id:'mixkitCartoonVoiceLaugh',name:"Cartoon Voice Laugh",path:'assets/sounds/mixkit/cartoon-voice-laugh.mp3'},
  mixkitCasinoBlingAchievement:{id:'mixkitCasinoBlingAchievement',name:"Casino Bling Achievement",path:'assets/sounds/mixkit/casino-bling-achievement.mp3'},
  mixkitGameBonusReached:{id:'mixkitGameBonusReached',name:"Game Bonus Reached",path:'assets/sounds/mixkit/game-bonus-reached.mp3'},
  mixkitGameFluteBonus:{id:'mixkitGameFluteBonus',name:"Game Flute Bonus",path:'assets/sounds/mixkit/game-flute-bonus.mp3'},
  mixkitGameJump:{id:'mixkitGameJump',name:"Game Jump",path:'assets/sounds/mixkit/game-jump.mp3'},
  mixkitLevelCompleted:{id:'mixkitLevelCompleted',name:"Level Completed",path:'assets/sounds/mixkit/level-completed.mp3'},
  mixkitLevelCompletion:{id:'mixkitLevelCompletion',name:"Level Completion",path:'assets/sounds/mixkit/level-completion.mp3'},
  mixkitMagicGlitterShot:{id:'mixkitMagicGlitterShot',name:"Magic Glitter Shot",path:'assets/sounds/mixkit/magic-glitter-shot.mp3'},
  mixkitMagicSweepTrophy:{id:'mixkitMagicSweepTrophy',name:"Magic Sweep Trophy",path:'assets/sounds/mixkit/magic-sweep-trophy.mp3'},
  mixkitQuickPositiveNotif:{id:'mixkitQuickPositiveNotif',name:"Quick Positive Notif",path:'assets/sounds/mixkit/quick-positive-notif.mp3'},
  mixkitRetroArcadeCasino:{id:'mixkitRetroArcadeCasino',name:"Retro Arcade Casino",path:'assets/sounds/mixkit/retro-arcade-casino.mp3'},
  mixkitRetroBubbleLaser:{id:'mixkitRetroBubbleLaser',name:"Retro Bubble Laser",path:'assets/sounds/mixkit/retro-bubble-laser.mp3'},
  mixkitScifiPositiveNotif:{id:'mixkitScifiPositiveNotif',name:"Scifi Positive Notif",path:'assets/sounds/mixkit/scifi-positive-notif.mp3'},
  mixkitUnlockNotification:{id:'mixkitUnlockNotification',name:"Unlock Notification",path:'assets/sounds/mixkit/unlock-notification.mp3'},
  mixkitVideoGameTreasure:{id:'mixkitVideoGameTreasure',name:"Video Game Treasure",path:'assets/sounds/mixkit/video-game-treasure.mp3'},
  mixkitWinAchievementBell:{id:'mixkitWinAchievementBell',name:"Win Achievement Bell",path:'assets/sounds/mixkit/win-achievement-bell.mp3'},
  mixkitWinArcadeBonusAlert:{id:'mixkitWinArcadeBonusAlert',name:"Win Arcade Bonus Alert",path:'assets/sounds/mixkit/win-arcade-bonus-alert.mp3'},
  mixkitWinArcadeJumpCoin:{id:'mixkitWinArcadeJumpCoin',name:"Win Arcade Jump Coin",path:'assets/sounds/mixkit/win-arcade-jump-coin.mp3'},
  mixkitWinCasinoReward:{id:'mixkitWinCasinoReward',name:"Win Casino Reward",path:'assets/sounds/mixkit/win-casino-reward.mp3'},
  mixkitWinCoin:{id:'mixkitWinCoin',name:"Win Coin",path:'assets/sounds/mixkit/win-coin.mp3'},
  mixkitWinEtherealFairy:{id:'mixkitWinEtherealFairy',name:"Win Ethereal Fairy",path:'assets/sounds/mixkit/win-ethereal-fairy.mp3'},
  mixkitWinFairySuccessVoice:{id:'mixkitWinFairySuccessVoice',name:"Win Fairy Success Voice",path:'assets/sounds/mixkit/win-fairy-success-voice.mp3'},
  mixkitWinFantasySuccess:{id:'mixkitWinFantasySuccess',name:"Win Fantasy Success",path:'assets/sounds/mixkit/win-fantasy-success.mp3'},
  mixkitWinInstantWin:{id:'mixkitWinInstantWin',name:"Win Instant Win",path:'assets/sounds/mixkit/win-instant-win.mp3'},
  mixkitWinMaleVoiceCheer:{id:'mixkitWinMaleVoiceCheer',name:"Win Male Voice Cheer",path:'assets/sounds/mixkit/win-male-voice-cheer.mp3'},
  mixkitWinMalesYesVictory:{id:'mixkitWinMalesYesVictory',name:"Win Males Yes Victory",path:'assets/sounds/mixkit/win-males-yes-victory.mp3'},
  mixkitWinMelodicBonusCollect:{id:'mixkitWinMelodicBonusCollect',name:"Win Melodic Bonus Collect",path:'assets/sounds/mixkit/win-melodic-bonus-collect.mp3'},
  mixkitWinQuickWinNotif:{id:'mixkitWinQuickWinNotif',name:"Win Quick Win Notif",path:'assets/sounds/mixkit/win-quick-win-notif.mp3'},
  mixkitWinRetroGameNotif:{id:'mixkitWinRetroGameNotif',name:"Win Retro Game Notif",path:'assets/sounds/mixkit/win-retro-game-notif.mp3'},
  mixkitWinSmallGroupApplause:{id:'mixkitWinSmallGroupApplause',name:"Win Small Group Applause",path:'assets/sounds/mixkit/win-small-group-applause.mp3'},
  mixkitWinSmallWin:{id:'mixkitWinSmallWin',name:"Win Small Win",path:'assets/sounds/mixkit/win-small-win.mp3'},
  mixkitWinSpaceCoin:{id:'mixkitWinSpaceCoin',name:"Win Space Coin",path:'assets/sounds/mixkit/win-space-coin.mp3'},
  mixkitWinVideoGameWin:{id:'mixkitWinVideoGameWin',name:"Win Video Game Win",path:'assets/sounds/mixkit/win-video-game-win.mp3'},
  mixkitWinWinningChimes:{id:'mixkitWinWinningChimes',name:"Win Winning Chimes",path:'assets/sounds/mixkit/win-winning-chimes.mp3'},
  mixkitWinWinningNotification:{id:'mixkitWinWinningNotification',name:"Win Winning Notification",path:'assets/sounds/mixkit/win-winning-notification.mp3'},
  mixkitWinWinningSwoosh:{id:'mixkitWinWinningSwoosh',name:"Win Winning Swoosh",path:'assets/sounds/mixkit/win-winning-swoosh.mp3'},
  mixkitWinningExtraBonus:{id:'mixkitWinningExtraBonus',name:"Winning Extra Bonus",path:'assets/sounds/mixkit/winning-extra-bonus.mp3'},
  mixkitXpLevelIncreased:{id:'mixkitXpLevelIncreased',name:"Xp Level Increased",path:'assets/sounds/mixkit/xp-level-increased.mp3'},
  soundbibleBikeHorn:{id:'soundbibleBikeHorn',name:"Bike Horn",path:'assets/sounds/soundbible/bike-horn.mp3'},
  soundbibleDoorbell:{id:'soundbibleDoorbell',name:"Doorbell",path:'assets/sounds/soundbible/doorbell.mp3'},
  soundbibleDrumRoll:{id:'soundbibleDrumRoll',name:"Drum Roll",path:'assets/sounds/soundbible/drum-roll.mp3'},
  soundbibleKidLaugh:{id:'soundbibleKidLaugh',name:"Kid Laugh",path:'assets/sounds/soundbible/kid-laugh.mp3'},
  soundbibleMagicWand:{id:'soundbibleMagicWand',name:"Magic Wand",path:'assets/sounds/soundbible/magic-wand.mp3'},
  soundbibleSadTrombone:{id:'soundbibleSadTrombone',name:"Sad Trombone",path:'assets/sounds/soundbible/sad-trombone.mp3'}
};

// KENNEY-PAKETEN — 533 ljud, licensen ar CC0 (public domain), se assets/sounds/kenney/LICENSE.txt.
//
// VARFOR CC0 OCH INTE FLER FRAN PIXABAY/MIXKIT. Bada de licenserna tillater kommersiell
// anvandning men forbjuder att innehallet distribueras "standalone" — i oforandrad form, utan att
// nagon kreativ insats lagts till. Ett bibliotek dar kunden bladdrar bland ljudklipp och kopplar
// dem rakt av ligger nara den grensen, och saGetMediaMeta() nedan hamtar dessutom filen och lagger
// den som en File hos anvandaren. CC0 har inga sadana villkor alls: ingen attribution, inga
// begransningar. Darfor ar massan CC0, och Pixabay/Mixkit star kvar for enstaka karaktarsljud.
//
// FILERNA ar konverterade fran Kenneys .ogg till .mp3. Det ar inte kosmetik: saGetMediaMeta()
// hardkodar bade '.mp3' i filnamnet och 'audio/mpeg' som typ, sa en .ogg hade lagts in under fel
// mimetyp. Langderna ar 0,28–1,76 s for jinglarna — alla ligger med god marginal under den
// duration: 6 som kopplingen satter pa sin Action.
//
// Grupperna nedan ar SJU Kenney-paket (interface och ui har overlappande filnamn — bada har click
// och switch — darav skilda prefix). Namnen ar systematiska med flit — ingen har lyssnat igenom
// 533 klipp och dopt dem efter kansla, och ett pahittat beskrivande namn hade ljugit. Casino,
// digital, rpg och impact tillkom senare; deras etiketter ar Kenneys egna engelska basnamn.
const KENNEY_GRUPPER = [
  ['jingle', 'Jingel', {'8bit':['8-bit',17],hit:['Hit',17],pizzicato:['Pizzicato',17],sax:['Sax',17],steel:['Steel',17]}],
  ['interface', 'Gränssnitt', {back:['Tillbaka',4],bong:['Bong',1],click:['Klick',5],close:['Stäng',4],confirmation:['Bekräftelse',4],drop:['Släpp',4],error:['Fel',8],glass:['Glas',6],glitch:['Glitch',4],maximize:['Maximera',9],minimize:['Minimera',9],open:['Öppna',4],pluck:['Pluck',2],question:['Fråga',4],scratch:['Skrapa',5],scroll:['Scroll',5],select:['Välj',8],switch:['Växel',7],tick:['Tick',3],toggle:['Växla',4]}],
  ['ui', 'Panel', {click:['Klick',5],mouseclick:['Musklick',1],mouserelease:['Mussläpp',1],rollover:['Hovring',6],switch:['Växel',38]}],
  ['casino', 'Casino', {'card-fan':['Card Fan',2],'card-place':['Card Place',4],'card-shove':['Card Shove',4],'card-shuffle':['Card Shuffle',1],'card-slide':['Card Slide',8],'cards-pack-open':['Cards Pack Open',2],'cards-pack-take-out':['Cards Pack Take Out',2],'chip-lay':['Chip Lay',3],'chips-collide':['Chips Collide',4],'chips-handle':['Chips Handle',6],'chips-stack':['Chips Stack',6],'dice-grab':['Dice Grab',2],'dice-shake':['Dice Shake',3],'dice-throw':['Dice Throw',3],'die-throw':['Die Throw',4]}],
  ['digital', 'Digital', {highDown:['High Down',1],highUp:['High Up',1],laser:['Laser',9],lowDown:['Low Down',1],lowRandom:['Low Random',1],lowThreeTone:['Low Three Tone',1],pepSound:['Pep Sound',5],phaseJump:['Phase Jump',5],phaserDown:['Phaser Down',3],phaserUp:['Phaser Up',7],powerUp:['Power Up',12],spaceTrash:['Space Trash',5],threeTone:['Three Tone',2],tone:['Tone',1],twoTone:['Two Tone',2],zap:['Zap',2],zapThreeToneDown:['Zap Three Tone Down',1],zapThreeToneUp:['Zap Three Tone Up',1],zapTwoTone:['Zap Two Tone',2]}],
  ['rpg', 'RPG', {beltHandle:['Belt Handle',2],bookClose:['Book Close',1],bookFlip:['Book Flip',3],bookOpen:['Book Open',1],bookPlace:['Book Place',3],chop:['Chop',1],cloth:['Cloth',4],clothBelt:['Cloth Belt',2],creak:['Creak',3],doorClose:['Door Close',4],doorOpen:['Door Open',2],drawKnife:['Draw Knife',3],dropLeather:['Drop Leather',1],footstep:['Footstep',10],handleCoins:['Handle Coins',2],handleSmallLeather:['Handle Small Leather',2],knifeSlice:['Knife Slice',2],metalClick:['Metal Click',1],metalLatch:['Metal Latch',1],metalPot:['Metal Pot',3]}],
  ['impact', 'Impact', {'footstep_carpet':['Footstep Carpet',5],'footstep_concrete':['Footstep Concrete',5],'footstep_grass':['Footstep Grass',5],'footstep_snow':['Footstep Snow',5],'footstep_wood':['Footstep Wood',5],'impactBell_heavy':['Impact Bell Heavy',5],'impactGeneric_light':['Impact Generic Light',5],'impactGlass_heavy':['Impact Glass Heavy',5],'impactGlass_light':['Impact Glass Light',5],'impactGlass_medium':['Impact Glass Medium',5],'impactMetal_heavy':['Impact Metal Heavy',5],'impactMetal_light':['Impact Metal Light',5],'impactMetal_medium':['Impact Metal Medium',5],impactMining:['Impact Mining',5],'impactPlank_medium':['Impact Plank Medium',5],'impactPlate_heavy':['Impact Plate Heavy',5],'impactPlate_light':['Impact Plate Light',5],'impactPlate_medium':['Impact Plate Medium',5],'impactPunch_heavy':['Impact Punch Heavy',5],'impactPunch_medium':['Impact Punch Medium',5],'impactSoft_heavy':['Impact Soft Heavy',5],'impactSoft_medium':['Impact Soft Medium',5],'impactTin_medium':['Impact Tin Medium',5],'impactWood_heavy':['Impact Wood Heavy',5],'impactWood_light':['Impact Wood Light',5],'impactWood_medium':['Impact Wood Medium',5]}]
];
for (const [mapp, grupp, poster] of KENNEY_GRUPPER) {
  for (const [fil, [etikett, antal]] of Object.entries(poster)) {
    for (let i = 1; i <= antal; i++) {
      const nr = String(i).padStart(2, '0'), id = `${mapp}-${fil}-${nr}`;
      soundAlerts[id] = {id, name:`${grupp} ${etikett} ${i}`, path:`assets/sounds/kenney/${mapp}-${fil}-${nr}.mp3`};
    }
  }
}
const SA_TRIGGERS={gift:'Gåva mottagen',follow:'Ny följare',member:'Ny medlem',likes:'Likes uppnådda',share:'Delning',chat:'Kommentar',chatCommand:'Chattkommando',giftCoins:'Minsta coin-värde',subscriberEmote:'Subscriber-emote',fanSticker:'Fan Club-sticker',shopPurchase:'TikTok Shop-köp'};
const SA_AE_KEY='vyra-action-event-v2';
const SA_LIBRARY_KEY='vyra-sound-alert-library-v1';
function aeRead(){return JSON.parse(localStorage.getItem(SA_AE_KEY)||'{"actions":[],"events":[]}')}
async function aeWrite(state){
  const result=await window.VyraSessionState.writeActive(SA_AE_KEY,JSON.stringify(state));
  return result?.ok===true;
}
function saEsc(value=''){const el=document.createElement('span');el.textContent=String(value);return el.innerHTML}
function saReadLibrary(){try{const items=JSON.parse(localStorage.getItem(SA_LIBRARY_KEY)||'[]');return Array.isArray(items)?items:[]}catch{return[]}}
function saWriteLibrary(items){localStorage.setItem(SA_LIBRARY_KEY,JSON.stringify(items))}
function saSounds(){return [...Object.values(soundAlerts),...saReadLibrary()]}
function saConnections(){const state=aeRead();return state.events.filter(event=>event.soundAlertId).map(event=>({event,action:state.actions.find(action=>action.id===event.actionId)})).filter(item=>item.action)}
function saSound(soundId){return saSounds().find(sound=>sound.id===soundId)||null}
function saConnection(soundId){return saConnections().find(item=>item.event.soundAlertId===soundId)||null}
function saOpenDb(){return new Promise((ok,no)=>{const request=indexedDB.open('vyra-action-media',1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('files'))request.result.createObjectStore('files')};request.onsuccess=()=>ok(request.result);request.onerror=()=>no(request.error)})}
async function saStoreFile(file){const database=await saOpenDb(),id='media-'+Date.now()+'-'+Math.random().toString(36).slice(2);await new Promise((ok,no)=>{const tx=database.transaction('files','readwrite');tx.objectStore('files').put(file,id);tx.oncomplete=ok;tx.onerror=()=>no(tx.error)});database.close();return{id,name:file.name,type:file.type,size:file.size}}
async function saReadFile(meta){if(!meta?.id)return null;const database=await saOpenDb(),value=await new Promise((ok,no)=>{const request=database.transaction('files').objectStore('files').get(meta.id);request.onsuccess=()=>ok(request.result);request.onerror=()=>no(request.error)});database.close();return value}
async function saGetMediaMeta(sound){if(sound.mediaMeta)return sound.mediaMeta;if(sound.path)return{packagePath:sound.path,name:sound.name};return null}
function saTriggerOptions(selected='gift'){return Object.entries(SA_TRIGGERS).map(([key,label])=>`<option value="${key}"${key===selected?' selected':''}>${label}</option>`).join('')}
function saEventLabel(item){const trigger=SA_TRIGGERS[item.event.trigger]||item.event.trigger||'Event';const condition=String(item.event.condition||'').trim();return condition?`${trigger} · ${condition}`:trigger}
function saActiveRow(item){const sound=saSound(item.event.soundAlertId),action=item.action;return `<article class="sa-alert-row" data-alert="${saEsc(item.event.id)}"><button class="sa-row-play" type="button" aria-label="Testa ${saEsc(sound?.name||action.name)}">▶</button><div class="sa-alert-copy"><b>${saEsc(sound?.name||action.name||'Ljudalert')}</b><small>${saEsc(saEventLabel(item))}</small></div><span class="sa-alert-meta">${Number(action.volume??80)}% · ${Number(action.cooldown||0)} s cooldown</span><label class="sa-switch"><input type="checkbox" class="sa-toggle"${item.event.enabled?' checked':''}><span></span></label><button class="sa-remove" type="button" aria-label="Ta bort">×</button></article>`}
function soundAlertCard(sound){const linked=saConnection(sound.id);return `<article class="media-card sound-card" data-sound="${saEsc(sound.id)}"><div class="sound-icon"><i>♪</i><button class="media-play" type="button" aria-label="Spela ${saEsc(sound.name)}">▶</button></div><div class="media-info"><b>${saEsc(sound.name)}</b><small>${linked?`Används i ${saEsc(saEventLabel(linked))}`:'Tillgängligt i biblioteket'}</small></div></article>`}
function saGiftPickerHtml(){return `<div class="sa-gift-picker"><label>Gåva <button type="button" class="sa-gift-open"><span>Alla gåvor</span><b>Välj ur ${Array.isArray(window.VYRA_GIFTS)?window.VYRA_GIFTS.length:0} gåvor</b></button></label><div class="sa-gift-popover" hidden><input class="sa-gift-search" type="search" placeholder="Sök gåva, t.ex. Lion"><div class="sa-gift-results"></div></div></div>`}
function saNewAlertHtml(){return `<section class="sa-create-card"><div><span class="sa-kicker">NY SOUND ALERT</span><h3>Välj vad som ska höras i din LIVE</h3><p>Koppla ett ljud till en gåva, följare eller ett annat event. Du kan alltid testa innan du sparar.</p></div><form class="sa-form" id="saNewAlert"><label>När detta händer<select name="trigger">${saTriggerOptions()}</select></label><div class="sa-condition-wrap">${saGiftPickerHtml()}</div><label>Ljud från biblioteket<select name="sound">${saSounds().map(sound=>`<option value="${saEsc(sound.id)}">${saEsc(sound.name)}</option>`).join('')}</select></label><label>Volym <output>80%</output><input name="volume" type="range" min="0" max="100" value="80"></label><label>Cooldown (sekunder)<input name="cooldown" type="number" min="0" max="300" value="2"></label><div class="sa-form-actions"><button type="button" class="sa-test-new">▶ Testa ljud</button><button type="submit" class="primary">Spara alert</button></div></form></section>`}
function saLibraryCards(sounds){return sounds.slice(0,48).map(soundAlertCard).join('')||'<p class="sa-gift-none">Inget ljud hittades.</p>'}
function saLibraryHtml(){const sounds=saSounds();return `<div class="sa-library-head"><div><h3>Ditt ljudbibliotek</h3><p>${sounds.length} ljud · välj ett ljud när du skapar en alert</p></div><label class="sa-upload">＋ Lägg till eget ljud<input type="file" accept="audio/*,.mp3,.wav,.ogg" hidden></label></div><input class="sa-library-search" type="search" placeholder="Sök bland dina ljud"><div class="media-grid sa-library-grid">${saLibraryCards(sounds)}</div>`}
function soundAlertsHtml(){const active=saConnections();return `<div class="page-header section-head sa-page-head"><div><span class="sa-kicker">LIVE-AUTOMATIK</span><h2>Sound Alerts</h2><p>Spela ett ljud när din community gör något i liven.</p></div><button class="primary sa-new-open" type="button">＋ Ny sound alert</button></div><div class="sa-tabs" role="tablist"><button class="active" data-sa-tab="alerts" type="button">Aktiva alerts <b>${active.length}</b></button><button data-sa-tab="library" type="button">Ljudbibliotek <b>${saSounds().length}</b></button></div><div class="sa-pane active" data-sa-pane="alerts"><section class="sa-active-card"><div class="sa-active-head"><div><h3>Aktiva alerts</h3><p>Slå av, testa eller ta bort utan att radera ditt ljud.</p></div><button class="btn btn-secondary sa-new-open" type="button">＋ Ny alert</button></div>${active.length?`<div class="sa-alert-list">${active.map(saActiveRow).join('')}</div>`:`<div class="sa-empty"><strong>Inga sound alerts ännu</strong><span>Skapa din första alert och ge din LIVE en egen känsla.</span><button class="primary sa-new-open" type="button">Skapa första alerten</button></div>`}</section></div><div class="sa-pane" data-sa-pane="library">${saLibraryHtml()}</div><div class="sa-modal" hidden><div class="sa-modal-backdrop"></div><div class="sa-modal-card" role="dialog" aria-modal="true"><button class="sa-modal-close" type="button" aria-label="Stäng">×</button>${saNewAlertHtml()}</div></div>`}

let saPlayingAudio=null,saPlayingBtn=null;
async function saPlaySound(sound,button){
  if(!sound)throw Error('Ljud saknas');
  if(saPlayingAudio){saPlayingAudio.pause();if(saPlayingBtn)saPlayingBtn.textContent='▶'}
  const meta=await saGetMediaMeta(sound),blob=meta?.packagePath?null:await saReadFile(meta);
  if(!meta?.packagePath&&!blob)throw Error('Ljudfil saknas');
  const url=meta.packagePath||URL.createObjectURL(blob),audio=new Audio(url);
  audio.onended=()=>{if(button)button.textContent='▶';if(!meta.packagePath)URL.revokeObjectURL(url);saPlayingAudio=null;saPlayingBtn=null};
  audio.onerror=()=>{if(button)button.textContent='▶';if(!meta.packagePath)URL.revokeObjectURL(url);toast('Ljudfilen kunde inte läsas')};
  /* Samma ljudprioritet som Action & Event: preview ska inte konkurrera med TTS. */
  window.VyraTal?.duckaLjud?.(audio,1);saPlayingAudio=audio;saPlayingBtn=button||null;if(button)button.textContent='❚❚';await audio.play();
}
function saGiftResults(popover,query=''){
  const all=Array.isArray(window.VYRA_GIFTS)?window.VYRA_GIFTS:[];
  const needle=query.trim().toLocaleLowerCase('sv');
  const gifts=(needle?all.filter(gift=>String(gift.name).toLocaleLowerCase('sv').includes(needle)):all).slice(0,40);
  popover.querySelector('.sa-gift-results').innerHTML=`<button type="button" class="sa-gift-choice" data-gift=""><span class="sa-gift-fallback">★</span><b>Alla gåvor</b><small>Spela ljudet vid varje gåva</small></button>${gifts.map(gift=>`<button type="button" class="sa-gift-choice" data-gift="${saEsc(gift.name)}"><img src="${saEsc(gift.file)}" alt=""><b>${saEsc(gift.name)}</b></button>`).join('')||'<p class="sa-gift-none">Ingen gåva hittades.</p>'}`;
}
function saBindGiftPicker(form){
  const picker=form.querySelector('.sa-gift-picker');if(!picker)return;
  const opener=picker.querySelector('.sa-gift-open'),popover=picker.querySelector('.sa-gift-popover'),search=picker.querySelector('.sa-gift-search');
  let selected='';saGiftResults(popover);
  opener.onclick=()=>{popover.hidden=!popover.hidden;if(!popover.hidden)search.focus()};
  search.oninput=()=>saGiftResults(popover,search.value);
  popover.onclick=event=>{const choice=event.target.closest('.sa-gift-choice');if(!choice)return;selected=choice.dataset.gift||'';opener.dataset.gift=selected;opener.querySelector('span').textContent=selected||'Alla gåvor';opener.querySelector('b').textContent=selected?'Specifik gåva':'Spela ljudet vid varje gåva';popover.hidden=true};
}
function saCreateAlert(form){
  return async event=>{event.preventDefault();const data=new FormData(form),sound=saSound(data.get('sound'));try{const audioMedia=await saGetMediaMeta(sound);if(!audioMedia)throw Error('Ljud saknas');const state=aeRead(),stamp=Date.now(),actionId=`a${stamp}-${sound.id}`,eventId=`e${stamp}-${sound.id}`,gift=form.querySelector('.sa-gift-open')?.dataset.gift||'',trigger=data.get('trigger');state.actions.push({id:actionId,name:sound.name,types:['audio'],duration:6,cooldown:Math.max(0,Number(data.get('cooldown'))||0),volume:Math.max(0,Math.min(100,Number(data.get('volume'))||80)),audioMedia,scene:{number:1}});state.events.push({id:eventId,trigger,condition:trigger==='gift'?gift:'',actionId,enabled:true,soundAlertId:sound.id});if(!await aeWrite(state))throw Error('Skrivning nekades');window.VyraActionEvent?.refresh?.();toast(`${sound.name} är kopplad till ${SA_TRIGGERS[trigger]||trigger}`);renderSoundAlerts()}catch{toast('Kunde inte spara sound alerten. Öppna VYRA Studio i ett aktivt projekt och försök igen.')}}
}
function bindSoundAlerts(){
  saPlayingAudio=null;saPlayingBtn=null;
  document.querySelectorAll('.sound-card').forEach(card=>{const sound=saSound(card.dataset.sound),button=card.querySelector('.media-play');button.onclick=async()=>{try{if(saPlayingBtn===button&&saPlayingAudio&&!saPlayingAudio.paused){saPlayingAudio.pause();button.textContent='▶';saPlayingAudio=null;saPlayingBtn=null;return}await saPlaySound(sound,button)}catch{button.textContent='▶';toast('Webbläsaren blockerade eller saknar ljudet')}}});
  document.querySelectorAll('[data-sa-tab]').forEach(tab=>tab.onclick=()=>{const selected=tab.dataset.saTab;document.querySelectorAll('[data-sa-tab]').forEach(item=>item.classList.toggle('active',item===tab));document.querySelectorAll('[data-sa-pane]').forEach(pane=>pane.classList.toggle('active',pane.dataset.saPane===selected))});
  const modal=document.querySelector('.sa-modal'),openModal=()=>{modal.hidden=false;saBindGiftPicker(modal.querySelector('form'))};document.querySelectorAll('.sa-new-open').forEach(button=>button.onclick=openModal);modal?.querySelector('.sa-modal-close')?.addEventListener('click',()=>modal.hidden=true);modal?.querySelector('.sa-modal-backdrop')?.addEventListener('click',()=>modal.hidden=true);
  const form=document.querySelector('#saNewAlert');if(form){form.onsubmit=saCreateAlert(form);const volume=form.elements.volume;volume.oninput=()=>volume.closest('label').querySelector('output').textContent=`${volume.value}%`;form.querySelector('.sa-test-new').onclick=async()=>{try{await saPlaySound(saSound(new FormData(form).get('sound')),form.querySelector('.sa-test-new'))}catch{toast('Ljudet kunde inte spelas')}}}
  document.querySelectorAll('.sa-toggle').forEach(toggle=>toggle.onchange=async()=>{const state=aeRead(),event=state.events.find(item=>item.id===toggle.closest('[data-alert]').dataset.alert);if(event){event.enabled=toggle.checked;if(await aeWrite(state))window.VyraActionEvent?.refresh?.();else{toggle.checked=!toggle.checked;toast('Kunde inte spara ändringen')}}});
  document.querySelectorAll('.sa-row-play').forEach(button=>button.onclick=async()=>{try{const item=saConnections().find(connection=>connection.event.id===button.closest('[data-alert]').dataset.alert);await saPlaySound(saSound(item?.event.soundAlertId),button)}catch{toast('Ljudet kunde inte spelas')}});
  document.querySelectorAll('.sa-remove').forEach(button=>button.onclick=async()=>{const id=button.closest('[data-alert]').dataset.alert,state=aeRead(),removed=state.events.find(event=>event.id===id);state.events=state.events.filter(event=>event.id!==id);if(removed&&!state.events.some(event=>event.actionId===removed.actionId))state.actions=state.actions.filter(action=>action.id!==removed.actionId);if(!await aeWrite(state)){toast('Kunde inte ta bort sound alerten');return}window.VyraActionEvent?.refresh?.();toast('Sound alert borttagen');renderSoundAlerts()});
  const upload=document.querySelector('.sa-upload input');if(upload)upload.onchange=async()=>{const file=upload.files?.[0];if(!file)return;if(!/^audio\//.test(file.type)&&!/\.(mp3|wav|ogg)$/i.test(file.name)){toast('Välj en MP3, WAV eller OGG-fil');return}try{const mediaMeta=await saStoreFile(file),id=`custom-${Date.now()}`;saWriteLibrary([...saReadLibrary(),{id,name:file.name.replace(/\.[^.]+$/,''),mediaMeta}]);toast('Ditt ljud är tillagt i biblioteket');renderSoundAlerts()}catch{toast('Kunde inte spara ljudfilen')}};
  const librarySearch=document.querySelector('.sa-library-search');if(librarySearch)librarySearch.oninput=()=>{const needle=librarySearch.value.trim().toLocaleLowerCase('sv');document.querySelector('.sa-library-grid').innerHTML=saLibraryCards(saSounds().filter(sound=>String(sound.name).toLocaleLowerCase('sv').includes(needle)));bindSoundAlerts()};
}

function renderSoundAlerts(){const view=document.querySelector('#view');if(!view||document.querySelector('#title')?.textContent!=='Sound Alerts')return;document.querySelector('#title').textContent='Sound Alerts';view.innerHTML=soundAlertsHtml();bindSoundAlerts()}
document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-extra="soundAlerts"]');if(!button)return;
  /* Sound Alerts är en egen studioyta. Den får inte förlita sig på att en annan
     modul råkar markera extra-knappar eller skriva rubriken först. */
  document.querySelectorAll('[data-view],[data-extra],aside a.active').forEach(item=>item.classList.remove('active'));
  button.classList.add('active');document.querySelector('#title').textContent='Sound Alerts';renderSoundAlerts();
},true);
