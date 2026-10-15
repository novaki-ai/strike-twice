# executed by process.py ; `which` = list of groups to build
def want(g):
    return 'all' in which or g in which

if want('sprites'):
    sprite('novaki_torso2', 200, 320, out='novaki_torso')
    for e in ['e_moth','e_mold','e_toadstool','e_beetle','e_stump','e_raindrop','e_slime','e_frog',
              'e_cloud','e_balloon','e_wateringcan','e_waxghost','e_snufflet','e_wisp','e_knight','e_wraith']:
        sprite(e, 200, 200)
    sprite('b_duchess', 560, 420)
    sprite('b_baron', 460, 460)
    sprite('b_snuffer', 400, 560)
    sprite('novaki_ko', 520, 420)
    sprite('novaki_cheer', 420, 520)
    sprite('novaki_idle_full', 300, 600)
    sprite('logo', 1000, 500)

if want('tiles'):
    tile('tile_forest', 512)
    tile('tile_docks', 512)
    tile('tile_spire', 512)

if want('pics'):
    for p in ['story_intro1','story_intro2','story_intro3','story_intro4','story_end1','story_end2','story_end3','menu_bg']:
        picture(p, 1280, 720)

if want('props'):
    sheet('props_forest', ['tree','shrooms','boulder','log','fern','lantern'], 300, 300, prefix='p1_')
    sheet('props_docks', ['lamp','barrel','crates','anchor','hydrant','bollard'], 260, 300, prefix='p2_')
    sheet('props_spire', ['candelabra','pillar','candles','gargoyle','brazier','books'], 260, 320, prefix='p3_')

if want('icons'):
    grid_sheet('sheet_icons_test', ['marshmallow','magnet','coin','chest','ember','goldmatch','firecracker','watch','heartcandle'], 128, 128, outdir=OUT+'/icons', prefix='')
    grid_sheet('icons_w1', ['ember','whip','ring','halo','volley','cracker','trail','aura','spark'], 128, 128, outdir=OUT+'/icons')
    grid_sheet('icons_w2', ['glare','cinders','breath','boomerang','sentry','sulfur','kindling','powder','bellows'], 128, 128, outdir=OUT+'/icons')
    grid_sheet('icons_p1', ['luckybox','varnish','shoes','lens','wool','oil','coal','twinwick','ash'], 128, 128, outdir=OUT+'/icons')
    grid_sheet('icons_p2', ['foil','phoenix','reroll','banish','skull','trophy','hourglass','heart','star'], 128, 128, outdir=OUT+'/icons')
