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

if want('extra'):
    picture('workshop_bg', 1280, 720)
    grid_sheet('icons_relics', ['r_kindling','r_wrath','r_ward','r_tithe','r_dance','r_coat','r_spare','r_lucky','r_bane'], 128, 128, outdir=OUT+'/icons')
    sprite('b_baron_atk', 480, 480)
    sprite('b_baron_ko', 460, 420)
    sprite('b_duchess_ko', 520, 420)
    sprite('b_duchess_atk', 560, 440)
    sprite('b_snuffer_atk', 440, 560)
    sprite('b_snuffer_ko', 440, 520)

if want('decals'):
    grid_sheet('sheet_decals', ['d1_moss','d1_leaves','d1_ring','d2_puddle','d2_manhole','d2_net','d3_wax','d3_rug','d3_bones'], 260, 260)

if want('interludes'):
    picture('interlude_1', 1280, 720)
    picture('interlude_2', 1280, 720)

if want('back'):
    sprite('novaki_torso_back', 200, 320)
