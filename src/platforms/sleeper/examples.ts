import * as T from './types';

const exampleSettings: T.LeagueSettings = {};
const exampleScoringSettings: T.ScoringSettings = {};
const exampleRosterPositions: T.RosterPosition[] = [];

const exampleLeague: T.LeagueInfo = {
    "total_rosters": 12,
    "status": "in_season",
    "sport": "nfl",
    "settings": exampleSettings,
    "season_type": "regular",
    "season": "2018",
    "scoring_settings": exampleScoringSettings,
    "roster_positions": exampleRosterPositions,
    "previous_league_id": "198946952535085056",
    "name": "Sleeperbot Dynasty",
    "league_id": "289646328504385536",
    "draft_id": "289646328508579840",
    "avatar": "efaefa889ae24046a53265a3c71b8b64"
};

const exampleDraft: T.DraftInfo = {
    "type": "snake",
    "status": "complete",
    "start_time": 1515700800000,
    "sport": "nfl",
    "settings": {
      "teams": 6,
      "slots_wr": 2,
      "slots_te": 1,
      "slots_rb": 2,
      "slots_qb": 1,
      "slots_k": 1,
      "slots_flex": 2,
      "slots_def": 1,
      "slots_bn": 5,
      "rounds": 15,
      "pick_timer": 120
    },
    "season_type": "regular",
    "season": "2017",
    "metadata": {
      "scoring_type": "ppr",
      "name": "My Dynasty",
      "description": ""
    },
    "league_id": "257270637750382592",
    "last_picked": 1515700871182,
    "last_message_time": 1515700942674,
    "last_message_id": "257272036450111488",
  
    // this is the user_id to draft slot mapping
    "draft_order": {
      "12345678": 1,
      "23434332": 2,
    },
  
    // this is the draft slot to roster_id mapping
    // leagues have rosters, which have roster_ids
    // this means draft slot 1 (column 1) will go to roster 10, slot 2 will go to roster_id 3, etc
    "slot_to_roster_id": {
      "1": 10,
      "2": 3,
      "3": 5
    },
  
    "draft_id": "257270643320426496",
    "creators": null,
    "created": 1515700610526
  }

const exampleDraftPicks: T.DraftPick[] = [
    {
        "player_id": "2391",
        "picked_by": "234343434", // user_id this pick will go to (not all leagues have users in every slot, this can be "")
        "roster_id": "1", // roster_id this pick will go to
        "round": 5,
        "draft_slot": 5, // which column this is on the draftboard
        "pick_no": 1,
        "metadata": {
            "team": "ARI",
            "status": "Injured Reserve",
            "sport": "nfl",
            "position": "RB",
            "player_id": "2391",
            "number": "31",
            "news_updated": "1513007102037",
            "last_name": "Johnson",
            "injury_status": "Out",
            "first_name": "David"
        },
        "is_keeper": null,
        "draft_id": "257270643320426496"
    },
    {
        "player_id": "1408",
        "picked_by": "234343434", // user_id this pick will go to (not all leagues have users in every slot, this can be "")
        "roster_id": "1", // roster_id this pick will go to
        "round": 5,
        "draft_slot": 6,
        "pick_no": 2,
        "metadata": {
            "team": "PIT",
            "status": "Active",
            "sport": "nfl",
            "position": "RB",
            "player_id": "1408",
            "number": "26",
            "news_updated": "1515698101257",
            "last_name": "Bell",
            "injury_status": "",
            "first_name": "Le'Veon"
        },
        "is_keeper": null,
        "draft_id": "257270643320426496"
    },
    {
        "player_id": "536",
        "picked_by": "667279356739584",
        "pick_no": 3,
        "metadata": {
            "team": "PIT",
            "status": "Active",
            "sport": "nfl",
            "position": "WR",
            "player_id": "536",
            "number": "84",
            "news_updated": "1515673801292",
            "last_name": "Brown",
            "injury_status": "Probable",
            "first_name": "Antonio"
        },
        "is_keeper": null,
        "draft_id": "257270643320426496"
    }
];

const examplePlayer: T.Player = {
    "hashtag": "#TomBrady-NFL-NE-12",
    "depth_chart_position": 1,
    "status": "Active",
    "sport": "nfl",
    "fantasy_positions": ["QB"],
    "number": 12,
    "search_last_name": "brady",
    "injury_start_date": null,
    "weight": "220",
    "position": "QB",
    "practice_participation": null,
    "sportradar_id": "",
    "team": "NE",
    "last_name": "Brady",
    "college": "Michigan",
    "fantasy_data_id": 17836,
    "injury_status": null,
    "player_id": "3086",
    "height": "6'4\"",
    "search_full_name": "tombrady",
    "age": 40,
    "stats_id": "",
    "birth_country": "United States",
    "espn_id": "",
    "search_rank": 24,
    "first_name": "Tom",
    "depth_chart_order": 1,
    "years_exp": 14,
    "rotowire_id": null,
    "rotoworld_id": 8356,
    "search_first_name": "tom",
    "yahoo_id": null
};

const examplePlayers: T.Players = {
    "3086": examplePlayer
};

const exampleLeagueUser = {
    "user_id": "<user_id>",
    "username": "<username>",
    "display_name": "<display_name>",
    "avatar": "1233456789",
    "metadata": {
        "team_name": "Dezpacito"
    },
    "is_owner": true   // is commissioner (there can be multiple commissioners)
};

export const realLeague: T.LeagueInfo = {
    "name": "The Ham",
    "status": "pre_draft",
    "metadata": {
      "auto_continue": "on",
      "keeper_deadline": "0",
      "latest_league_winner_roster_id": "4"
    },
    "settings": {
      "best_ball": 0,
      "waiver_budget": 100,
      "disable_adds": 0,
      "capacity_override": 0,
      "taxi_deadline": 0,
      "draft_rounds": 3,
      "reserve_allow_na": 0,
      "start_week": 1,
      "playoff_seed_type": 0,
      "playoff_teams": 6,
      "veto_votes_needed": 6,
      "position_limit_qb": 3,
      "squads": 1,
      "num_teams": 12,
      "daily_waivers_hour": 0,
      "playoff_type": 0,
      "taxi_slots": 0,
      "daily_waivers_days": 1093,
      "playoff_week_start": 15,
      "waiver_clear_days": 2,
      "reserve_allow_doubtful": 0,
      "commissioner_direct_invite": 0,
      "veto_auto_poll": 0,
      "reserve_allow_dnr": 0,
      "taxi_allow_vets": 0,
      "waiver_day_of_week": 2,
      "playoff_round_type": 0,
      "reserve_allow_out": 1,
      "reserve_allow_sus": 0,
      "veto_show_votes": 0,
      "trade_deadline": 99,
      "taxi_years": 0,
      "daily_waivers": 0,
      "disable_trades": 0,
      "pick_trading": 0,
      "type": 0,
      "max_keepers": 1,
      "waiver_type": 2,
      "max_subs": 0,
      "league_average_match": 0,
      "trade_review_days": 1,
      "bench_lock": 0,
      "offseason_adds": 0,
      "leg": 1,
      "reserve_slots": 2,
      "reserve_allow_cov": 1
    },
    "avatar": "af73f0a2cd03acb2adb64f6a99b9dceb",
    "company_id": null,
    "sport": "nfl",
    "season_type": "regular",
    "season": "2024",
    "shard": 423,
    "scoring_settings": {
      "sack": 1,
      "fgm_40_49": 4,
      "pass_int": -2,
      "pts_allow_0": 10,
      "pass_2pt": 2,
      "st_td": 6,
      "rec_td": 6,
      "fgm_30_39": 3,
      "xpmiss": -1,
      "rush_td": 6,
      "def_4_and_stop": 2,
      "rec_2pt": 2,
      "pass_int_td": -4,
      "st_fum_rec": 1,
      "fgmiss": -1,
      "ff": 1,
      "fgmiss_30_39": -2,
      "rec": 0.5,
      "pts_allow_14_20": 1,
      "def_2pt": 2,
      "fgm_0_19": 3,
      "int": 2,
      "def_st_fum_rec": 1,
      "fum_lost": -2,
      "pts_allow_1_6": 7,
      "kr_yd": 0.025,
      "fgmiss_20_29": -3,
      "fgm_20_29": 3,
      "pts_allow_21_27": 0,
      "xpm": 1,
      "def_3_and_out": 1,
      "fgmiss_0_19": -4,
      "pass_cmp": 0,
      "tkl_loss": 0.25,
      "rush_2pt": 2,
      "fum_rec": 1,
      "def_st_td": 6,
      "fgm_50p": 5,
      "def_td": 6,
      "safe": 4,
      "pass_yd": 0.04,
      "fgmiss_40_49": -1,
      "blk_kick": 2,
      "pass_td": 4,
      "rush_yd": 0.1,
      "pr_yd": 0.025,
      "fum": 0,
      "pts_allow_28_34": -1,
      "pts_allow_35p": -4,
      "fum_rec_td": 6,
      "rec_yd": 0.1,
      "bonus_fd_te": 0.5,
      "def_st_ff": 1,
      "pts_allow_7_13": 4,
      "st_ff": 1
    },
    "last_message_id": "1131624799522086912",
    "last_author_avatar": "3825dc533f88b89bc454b097f0d82d3a",
    "last_author_display_name": "JonnyK2",
    "last_author_id": "73448567356145664",
    "last_author_is_bot": null,
    "last_message_attachment": null,
    "last_message_text_map": null,
    "last_message_time": 1724162886079,
    "last_pinned_message_id": "1129588954514251776",
    "draft_id": "1050568427330465793",
    "last_read_id": null,
    "league_id": "1050568427330465792",
    "previous_league_id": "992211055641944064",
    "roster_positions": [
      "QB",
      "RB",
      "RB",
      "WR",
      "WR",
      "TE",
      "FLEX",
      "REC_FLEX",
      "SUPER_FLEX",
      "DEF",
      "BN",
      "BN",
      "BN",
      "BN",
      "BN"
    ],
    "group_id": null,
    "bracket_id": null,
    "loser_bracket_id": null,
    "total_rosters": 12
};  

export const realDraftInfo: T.DraftInfo = {
    "created": 1704837540994,
    "creators": [
        "73448567356145664",
        "381218859367178240"
    ],
    "draft_id": "1050568427330465793",
    "draft_order": null,
    "last_message_id": "1050568427330465793",
    "last_message_time": 1704837540994,
    "last_picked": 1724162895858,
    "league_id": "1050568427330465792",
    "metadata": {
        "description": "",
        "name": "The Ham",
        "scoring_type": "2qb"
    },
    "season": "2024",
    "season_type": "regular",
    "settings": {
        "alpha_sort": 0,
        "autopause_enabled": 0,
        "autopause_end_time": 900,
        "autopause_start_time": 180,
        "autostart": 0,
        "budget": 200,
        "cpu_autopick": 1,
        "enforce_position_limits": 1,
        "nomination_timer": 30,
        "pick_timer": 30,
        "player_type": 0,
        "position_limit_qb": 3,
        "reversal_round": 0,
        "rounds": 15,
        "slots_bn": 5,
        "slots_def": 1,
        "slots_flex": 1,
        "slots_qb": 1,
        "slots_rb": 2,
        "slots_rec_flex": 1,
        "slots_super_flex": 1,
        "slots_te": 1,
        "slots_wr": 2,
        "teams": 12
    },
    "slot_to_roster_id": {
        "1": 1,
        "2": 2,
        "3": 3,
        "4": 4,
        "5": 5,
        "6": 6,
        "7": 7,
        "8": 8,
        "9": 9,
        "10": 10,
        "11": 11,
        "12": 12
    },
    "sport": "nfl",
    "start_time": 1725496200000,
    "status": "pre_draft",
    "type": "auction"
};

export const realDraftPick: T.DraftPick = {
    "draft_id": "992211055641944065",
    "draft_slot": 2,
    "is_keeper": null,
    "metadata": {
        "amount": "1",
        "first_name": "Kansas City",
        "injury_status": "",
        "last_name": "Chiefs",
        "news_updated": "",
        "number": "",
        "player_id": "KC",
        "position": "DEF",
        "slot": "2",
        "sport": "nfl",
        "status": "",
        "team": "KC",
        "years_exp": ""
    },
    "pick_no": 180,
    "picked_by": "739615909098000384",
    "player_id": "KC",
    "roster_id": 4,
    "round": 15
};

export const realDraftPick2: T.DraftPick = {
    "draft_id": "992211055641944065",
    "draft_slot": 9,
    "is_keeper": null,
    "metadata": {
        "amount": "1",
        "first_name": "Nico",
        "injury_status": "",
        "last_name": "Collins",
        "news_updated": "1692496210240",
        "number": "12",
        "player_id": "7569",
        "position": "WR",
        "slot": "9",
        "sport": "nfl",
        "status": "Active",
        "team": "HOU",
        "years_exp": "2"
    },
    "pick_no": 144,
    "picked_by": "73448567356145664",
    "player_id": "7569",
    "roster_id": 1,
    "round": 12
};