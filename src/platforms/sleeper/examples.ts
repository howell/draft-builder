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