const Discord = require('discord.js');
const client = new Discord.Client();

const { HLTV } = require('hltv');

const DBL = require("dblapi.js");
const dbl = new DBL(process.env.DBL_TOKEN, client);

const teamDictionary = require("./teams.json");
const alternateTeamDictionary = require("./alternateteams.json");
const mapDictionary = require("./maps.json");
const formatDictionary = require("./formats.json");

const versionNumber = "1.4.13";
const hltvURL = "https://www.hltv.org";

const COMMANDCODE = {
  RESULTS: 0,
  MATCHES: 1,
  LIVEMATCHES: 2,
}

const reactionControls = {
  PREV_PAGE: '⬅',
  NEXT_PAGE: '➡',
  STOP: '⏹',
}

var id = function(x) {return x;};

/**
 * Returns a reversed hashmap from an input hashmap.
 *
 * @param {HashMap}   map           input hashmap to be reversed.
 * @param {function}   [f]          optional function parameter.
 *
 * @return {HashMap}                Returns the reversed hashmap.
 */
var reverseMapFromMap = function(map, f) {
  return Object.keys(map).reduce(function(acc, k) {
    acc[map[k]] = (acc[map[k]] || []).concat((f || id)(k))
    return acc
  },{})
}

/**
 * Formats the time given (in milliseconds) to a human readable string.
 *
 * @param {number}   milli           input time in milliseconds.
 *
 * @return {string}                  Returns the formatted time as a string.
 */
let getTime = (milli) => {
  let time = new Date(milli);
  let hours = time.getUTCHours();
  let minutes = time.getUTCMinutes();
  let seconds = time.getUTCSeconds();
  let milliseconds = time.getUTCMilliseconds();
  return hours + "H " + minutes + "M " + seconds + "S";
}

/**
 * Aims to provide page functionality to the published Discord embeds.
 *
 * Based on the 'code' parameter, the embed can only have a certain amount of results per page. startIndex is used to ensure a different startIndex can be provided to move along the pages. The res object is used to populated the pages alongside the other parameters.
 *
 * @param {Object}   res            Object containing the data to be formatted into pages.
 * @param {int}      startIndex     Which index within the Object to start populating the pages with.
 * @param {string}   code           An identifier used to determine where the function was called from and changes functionality accordingly.
 *
 * @return {Discord.RichEmbed}      Returns the formatted embed so it can be edited further or sent to the desired channel.
 */
var handlePages = (res, startIndex, code) => {
  var pageSize = 0;
  var embed = new Discord.RichEmbed()
      .setColor(0x00AE86)
      .setTimestamp();

  if(code == COMMANDCODE.RESULTS)
  {
    pageSize = 3;
    embed.setTitle("Match Results");
  }
  else if (code == COMMANDCODE.LIVEMATCHES)
  {
    pageSize = 5;
    embed.setTitle("Live Matches");
  }
  else if (code == COMMANDCODE.MATCHES)
  {
    pageSize = 3;
    embed.setTitle("Scheduled Matches");
  }

  for (var i = startIndex; i < startIndex+pageSize; i++)
  {
    var match = res[i];
    var pages = res.length/pageSize;

    if(match == null) //Error with live matches, assumes will have enough to fill 1 page so less than that throws an error
      return embed;

    // POPULATE EMBED
    var team1NameFormatted = match.team1.name.replace(/\s+/g, '-').toLowerCase();
    var team2NameFormatted = match.team2.name.replace(/\s+/g, '-').toLowerCase();
    var eventFormatted = match.event.name.replace(/\s+/g, '-').toLowerCase();

    embed.setFooter(`Page ${startIndex/pageSize + 1} of ${Math.ceil(pages) + 1}`, client.user.avatarURL);
    embed.addField(`Match`, `[${match.team1.name}](https://www.hltv.org/team/${match.team1.id}/${team1NameFormatted}) vs [${match.team2.name}](https://www.hltv.org/team/${match.team2.id}/${team2NameFormatted})`, false);

    if(code == COMMANDCODE.MATCHES)
    {
      var matchDate = new Date(match.date);
      if(match.live)
        matchDate = "Live";
      embed.addField("Date", `${matchDate.toString()}`, false);
    }
    embed.addField("Format", `${formatDictionary[match.format]}`, false);

    var mapStr = "";

    if (match.map != undefined)
    {
      var isMapArray = Array.isArray(match.map); //Some HLTVAPI endpoints return a map array whereas others return a map string
      if (isMapArray)
      {
        for (var mapKey in match.map)
        {
          var currMap = mapDictionary[match.map[mapKey]]
          if (currMap == undefined)
            mapStr += "Not Selected";
          else
            mapStr += currMap;

          if (mapKey != match.map.length - 1)
            mapStr += ", ";
        }
      }
      else
      {
        var currMap = mapDictionary[match.map];
        if (currMap == undefined)
          mapStr += "Not Selected";
        else
          mapStr += currMap;
      }
    }
    else if (match.maps != undefined) //Some HLTVAPI endpoints return a OBJ.maps array as opposed to a OBJ.map array
    {
      var isMapArray = Array.isArray(match.maps);
      if (isMapArray)
      {
        for (var mapKey in match.maps)
        {
          var currMap = mapDictionary[match.maps[mapKey]]
          if (currMap == undefined)
            mapStr += "Not Selected";
          else
            mapStr += currMap;

          if (mapKey != match.maps.length - 1)
            mapStr += ", ";
        }
      }
      else
      {
        var currMap = mapDictionary[match.maps];
        if (currMap == undefined)
          mapStr += "Not Selected";
        else
          mapStr += currMap;
      }
    }
    else
        mapStr += "Not Selected";

    embed.addField("Map", `${mapStr}`, false);
    embed.addField("Event", `[${match.event.name}](https://www.hltv.org/events/${match.event.id}/${eventFormatted})`, false);

    if(code == COMMANDCODE.RESULTS)
      embed.addField("Result", `${match.result}`, false);

    if(i != startIndex+(pageSize - 1))
      embed.addBlankField();
  }
  return embed;
}

/**
 * Aims to provide page functionality to the published Discord map embeds.
 *
 * startIndex is used to ensure a different startIndex can be provided to move along the pages. The res object contains the data to be published. teamName, teamID, mapArr and mapNameArr
 *
 * @param {Object}   res            Object containing the data to be formatted into pages.
 * @param {int}      startIndex     Which index within the Object to start populating the pages with.
 * @param {string}   teamName       The name of the team that this command was called for.
 * @param {int}      teamID         The ID of the team that this command was called for.
 * @param {string[]}   mapArr       A string array containing all the map codes the team has played.
 * @param {string[]}   mapNameArr   A string array containing all the map names the team has played.
 *
 * @return {Discord.RichEmbed}      Returns the formatted embed so it can be edited further or sent to the desired channel.
 */
var handleMapPages = (res, startIndex, teamName, teamID, mapArr, mapNameArr) =>
{
  var pageSize = 3;
  var embed = new Discord.RichEmbed()
      .setColor(0x00AE86)
      .setTimestamp()
      .setTitle(teamName + " Maps")
      .setColor(0x00AE86)
      .setTimestamp()
      .setURL(`https://www.hltv.org/stats/teams/${teamID}/${teamName}`);

      // console.log(`currIndex: ${startIndex}\n`);
      // console.log(`mapArr: ${mapArr}\n`);
      // console.log(`mapNameArr: ${mapNameArr}\n`);
      // console.log(`res: ${res}\n`);

  for (var i = startIndex; i < startIndex+pageSize; i++)
    {
      var map = mapArr[i];
      //console.log(map);
      var mapName = mapDictionary[mapNameArr[i]];
      //console.log(mapName);
      var pages = mapArr.length/pageSize;

      // if(map == null) //Error with live matches, assumes will have enough to fill 1 page so less than that throws an error
      //   return embed;

      embed.setFooter(`Page ${startIndex/pageSize + 1} of ${Math.ceil(pages)}`, client.user.avatarURL);

      // if (mapName == undefined)
      //   mapName = "Other";

      embed.addField(mapName, "==========================================================" , false);
      embed.addField("Wins", map.wins , true);
      embed.addField("Draws", map.draws , true);
      embed.addField("Losses", map.losses , true);
      embed.addField("Win Rate", map.winRate , true);
      embed.addField("Total Rounds", map.totalRounds , true);

      if(i != startIndex+(pageSize - 1))
        embed.addBlankField();
    }
    return embed;
}

/**
 * Aims to provide page functionality to the published Discord event embeds.
 *
 * startIndex is used to ensure a different startIndex can be provided to move along the pages. The res object contains the data to be published. teamName, teamID, mapArr and mapNameArr
 *
 * @param {Object}   eventArray     Object containing the events to be formatted into pages.
 * @param {int}      startIndex     Which index within the Object to start populating the pages with.
 *
 * @return {Discord.RichEmbed}      Returns the formatted embed so it can be edited further or sent to the desired channel.
 */
var handleEventPages = (eventArray, startIndex) =>
{
  var pageSize = 3;
  var embed = new Discord.RichEmbed()
      .setColor(0x00AE86)
      .setTimestamp()
      .setTitle("Events")
      .setColor(0x00AE86)
      .setTimestamp()
      .setURL(`https://www.hltv.org/events`);

  for (var i = startIndex; i < startIndex+pageSize; i++)
    {
      var event = eventArray[i];
      //console.log(event);
      var pages = eventArray.length/pageSize;

      embed.setFooter(`Page ${startIndex/pageSize + 1} of ${Math.ceil(pages)}`, client.user.avatarURL);

      if(event == undefined)
        break;
      var eventNameURLFormat = event.name.replace(/\s+/g, '-').toLowerCase();
      var matchStartDate;
      var matchEndDate;

      if(event.dateStart != undefined)
        matchStartDate = (new Date(event.dateStart)).toString();
      else
        matchStartDate = "Unknown";

      if(event.dateEnd != undefined)
        matchEndDate = (new Date(event.dateEnd)).toString();
      else
        matchEndDate = "Unknown";

      embed.addField("Name", `[${event.name}](https://www.hltv.org/events/${event.id}/${eventNameURLFormat})`);
      embed.addField("Start", matchStartDate);
      embed.addField("End", matchEndDate);
      embed.addField("Prize Pool", event.prizePool);
      embed.addField("Teams", event.teams);
      embed.addField("Location", event.location.name);
      embed.addField("Event Type", event.type);

      if(i != startIndex+(pageSize - 1))
        embed.addBlankField();
    }
    return embed;
}

client.on("ready", () =>
{
  var servercount = 0;
  var usercount = 0;
  var botcount = 0;
  var channelcount = 0;
  client.guilds.forEach((guild) =>
  {
    if (guild.id == "264445053596991498")
      return;

    servercount += 1;
    channelcount += guild.channels.filter(channel => channel.type != 'category').size;
    usercount += guild.members.filter(member => !member.user.bot).size;
    botcount += guild.members.filter(member => member.user.bot).size;
  })

  console.log(`HLTVBot is currently serving ${usercount} users, in ${channelcount} channels of ${servercount} servers. Alongside ${botcount} bot brothers.`);
  client.user.setActivity(`.hltv`, { type: 'LISTENING' });
  setInterval(() => {
    dbl.postStats(client.guilds.size, client.shards.Id, client.shards.total);}, 1800000);
  reverseTeamDictionary = reverseMapFromMap(teamDictionary);
});

client.on("guildCreate", guild =>
{
  console.log(`New guild joined: ${guild.name} (id: ${guild.id}). This guild has ${guild.memberCount} members!`);
});

client.on("guildDelete", guild =>
{
  console.log(`I have been removed from: ${guild.name} (id: ${guild.id})`);
});

client.on("message", async message =>
{
  // Ignore other bots.
  if(message.author.bot) return;

  // Ignore any message that does not start with our prefix
  if(message.content.indexOf(process.env.prefix) !== 0) return;

  // Separate our command names, and command arguments
  const args = message.content.slice(process.env.prefix.length).trim().split(/ +/g);
  const command = args.shift().toLowerCase();

  if(command == "threads")
  {
    HLTV.getRecentThreads().then((res) =>
    {
      //console.log(res);
      var embedcount = 0;
      var embed = new Discord.RichEmbed()
      .setTitle("Recent Threads")
      .setColor(0xff8d00)
      .setTimestamp()
      .setFooter("Sent by HLTVBot", client.user.avatarURL);
      for (index in res)
      {
        if(res[index].title != undefined && res[index].category == 'cs')
        {
          embed.addField(`${res[index].title}`, `[Link](${hltvURL + res[index].link}) Replies: ${res[index].replies} Category: ${res[index].category}`);
          embedcount++;
        }
        if(embedcount >= 24)
          break;
      }
      if (embedcount == 0)
        embed.setDescription("No Threads found, please try again later.")
      message.channel.send({embed});
    })
  }

  if(command == "news")
  {
    HLTV.getRecentThreads().then((res) =>
    {
      //console.log(res);
      var embedcount = 0;
      var embed = new Discord.RichEmbed()
      .setTitle("Recent News")
      .setColor(0xff8d00)
      .setTimestamp()
      .setFooter("Sent by HLTVBot", client.user.avatarURL);
      for (index in res)
      {
        if(res[index].title != undefined && ((res[index].category == 'news') || (res[index].category == 'match')))
        {
          embed.addField(`${res[index].title}`, `[Link](${hltvURL + res[index].link}) Replies: ${res[index].replies} Category: ${res[index].category}`);
          embedcount++;
        }
        if(embedcount >= 24)
          return;
      }
      if (embedcount == 0)
        embed.setDescription("No News found, please try again later.")
      message.channel.send({embed});
    });
  }

  // Outputs valid teams the user can use or the team rankings
  if(command == "teams")
  {
    var embed = new Discord.RichEmbed();
    var outputStr = "";
    if(args.length == 0) // if user has just entered .teams as opposed to .teams ranking
    {
      embed
      .setTitle("Valid Teams")
      .setColor(0xff8d00)
      .setTimestamp()
      .setFooter("Sent by HLTVBot", client.user.avatarURL)
      var count = 1;
      var teamKeysSorted = Object.keys(teamDictionary).sort();
      for (i = 0; i < teamKeysSorted.length; i++)
      {
        outputStr += teamKeysSorted[i];
        if(count != Object.keys(teamDictionary).length)
          outputStr += "\n";
        count++;
      }
      embed.setDescription(outputStr);
      message.channel.send({embed});
    }
    else if(args[0] == "rankings" || args[0] == "ranking") // if user has entered ".teams rankings"
    {
      HLTV.getTeamRanking().then((res) => {
        //console.log(res);
        for (var rankObjKey in res)
        {
          var rankObj = res[rankObjKey];
          var teamStr = `[${rankObj.team.name}](https://www.hltv.org/team/${rankObj.team.id}/${rankObj.team.name.replace(/\s+/g, '')})`;
          outputStr += `${rankObj.place}. ${teamStr} (${rankObj.change})\n`
        }
        embed
        .setTitle("Team Rankings")
        .setColor(0x00AE86)
        .setTimestamp()
        .setFooter("Sent by HLTVBot", client.user.avatarURL)
        .setDescription(outputStr);
        message.channel.send({embed});
      });
    }
    else
    {
      embed
      .setTitle("Command Error")
      .setColor(0x00AE86)
      .setTimestamp()
      .setFooter("Sent by HLTVBot", client.user.avatarURL)
      .setDescription("Invalid Command, use .hltv for commands");
      message.channel.send({embed});
    }
  }

    // Outputs player data or player rankings
    if(command == "player")
    {
      var embed = new Discord.RichEmbed();
      var outputStr = "";
      if(args[0] == "rankings" || args[0] == "ranking") // if user has entered ".player rankings"
      {
        HLTV.getPlayerRanking({startDate: '', endDate: '', rankingFilter: 'Top30'}).then((res) => {
          //console.log(res);
          var count = 1;
          for (var playerObjKey in res)
          {
            var playerObj = res[playerObjKey];
            outputStr += `${count}. [${playerObj.name}](https://www.hltv.org/stats/players/${playerObj.id}/${playerObj.name}) (${playerObj.rating})\n`
            if (count == 30)
              break;
            count++;
          }
          const embed = new Discord.RichEmbed()
          .setTitle("Player Rankings")
          .setColor(0x00AE86)
          .setTimestamp()
          .setFooter("Sent by HLTVBot", client.user.avatarURL)
          .setDescription(outputStr);
          message.channel.send({embed});
        });
      }
      else
      {
        HLTV.getPlayerByName({name: args[0]}).then((res)=>
        {
          //console.log(res);
          var embed = new Discord.RichEmbed()
          .setTitle(args[0] + " Player Profile")
          .setColor(0x00AE86)
          .setThumbnail(res.image)
          .setTimestamp()
          .setFooter("Sent by HLTVBot", client.user.avatarURL)
          .setURL(`https://www.hltv.org/player/${res.id}/${res.ign}/`)
          .addField("Name", res.name)
          .addField("IGN", res.ign)
          .addField("Age", res.age)
          .addField("Country", res.country.name)
          .addField("Facebook", res.facebook)
          .addField("Twitch", res.twitch)
          .addField("Twitter", res.twitter)
          .addField("Team", `[${res.team.name}](https://www.hltv.org/team/${res.team.id}/${res.team.name.replace(/\s+/g, '')})`)
          .addField("Rating", res.statistics.rating);
          message.channel.send({embed});
        }).catch(() => {
          var embed = new Discord.RichEmbed()
          .setTitle("Invalid Player")
          .setColor(0x00AE86)
          .setTimestamp()
          .setFooter("Sent by HLTVBot", client.user.avatarURL)
          .setDescription(`${args[0]} is not a valid playername. Please try again or visit hltv.org`);
          message.channel.send({embed});
        });
      }
    }

  // HLTV command represents commands pertinent to the actual bot, its functionality, diagnostics & statistics
  if(command === "hltv")
  {
    if (args.length == 0)
    {
      var embed = new Discord.RichEmbed()
      .setTitle("Help")
      .setColor(0xff8d00)
      .setTimestamp()
      .setFooter("Sent by HLTVBot", client.user.avatarURL)
      .addField(".hltv", "Lists all current commands", false)
      .addField(".hltv ping", "Displays the current ping to the bot & the API", false)
      .addField(".hltv stats", "Displays bot statistics, invite link and contact information", false)
      .addBlankField()
      .addField(".teams", "Lists all of the currently accepted teams", false)
      .addField(".teams rankings", "Displays the top 30 team rankings & recent position changes. 'ranking' is also accepted.", false)
      .addField(".[teamname]", "Displays the profile related to the input team", false)
      .addField(".[teamname] stats", "Displays the statistics related to the input team", false)
      .addField(".[teamname] maps", "Displays the map statistics related to the input team", false)
      .addField(".[teamname] link", "Displays a link to the input teams HLTV page", false)
      .addBlankField()
      .addField(".player [playername]", "Displays player statistics from the given playername", false)
      .addField(".player rankings", "Displays the top 30 player rankings & recent position changes. 'ranking' is also accepted.",false)
      .addBlankField()
      .addField(".livematches", "Displays all currently live matches", false)
      .addField(".matches", "Displays all known scheduled matches", false)
      .addField(".results", "Displays the most recent match results", false)
      .addField(".threads", "Displays the most recent hltv user threads", false)
      .addField(".news", "Displays the most recent hltv news & match info", false)
      .addField(".events", "Displays info on current & upcoming events", false)

      message.channel.send({embed});
    }
    else if (args[0] == "ping")
    {
      // Calculates ping between sending a message and editing it, giving a nice round-trip latency.
      // The second ping is an average latency between the bot and the websocket server (one-way, not round-trip)
      const m = await message.channel.send("Calculating");
      m.edit(`Latency is ${m.createdTimestamp - message.createdTimestamp}ms. API Latency is ${Math.round(client.ping)}ms`);
    }
    else if (args[0] == "stats")
    {
      var servercount = 0;
      var usercount = 0;
      var botcount = 0;
      var channelcount = 0;
      client.guilds.forEach((guild) =>
      {
        if (guild.id == "264445053596991498")
          return;
        servercount += 1;
        channelcount += guild.channels.filter(channel => channel.type != 'category').size;
        usercount += guild.members.filter(member => !member.user.bot).size;
        botcount += guild.members.filter(member => member.user.bot).size;
      })
      var embed = new Discord.RichEmbed()
      .setTitle("Bot Stats")
      .setColor(0xff8d00)
      .setTimestamp()
      .setThumbnail(client.user.avatarURL)
      .setFooter("Sent by HLTVBot", client.user.avatarURL)
      .addField("User Count", usercount, true)
      .addField("Bot User Count", botcount, true)
      .addField("Server Count", servercount, true)
      .addField("Channel Count", channelcount, true)
      .addField("Version", versionNumber, true)
      .addField("Uptime", getTime(client.uptime), true)
      .addField("Invite Link", "[Invite](https://discordapp.com/oauth2/authorize?client_id=548165454158495745&scope=bot&permissions=330816)", true)
      .addField("Support Link", "[GitHub](https://github.com/OhhLoz/HLTVBot)", true)
      .addField("Bot Page", "[Vote Here!](https://top.gg/bot/548165454158495745)", true)
      .addField("Donate", "[Donatebot.io](https://donatebot.io/checkout/509391645226172420)", true)
      message.channel.send(embed);
    }
    else
    {
      message.channel.send("Invalid Command, use .hltv for commands");
    }
  }

  // IF COMMAND STARTS WITH TEAMNAME (.nip, .cloud9, etc)
  if(teamDictionary.hasOwnProperty(command.toUpperCase()))
  {
    var teamName = command.toUpperCase();
    var teamID = teamDictionary[teamName];

    // IF JUST TEAMNAME display a team overview
    if(args.length == 0)
    {
      HLTV.getTeam({id: teamID}).then(res =>
        {
          // console.log(res);
          // console.log("\n\n\n ======================================================================== \n\n\n");
          var embed = new Discord.RichEmbed()
          .setTitle(teamName + " Profile")
          .setColor(0x00AE86)
          //.setThumbnail(res.logo)
          //.setImage(res.coverImage)
          .setTimestamp()
          .setFooter("Sent by HLTVBot", client.user.avatarURL)
          .setURL(`https://www.hltv.org/team/${teamID}/${teamName}`)
          .addField("Location", res.location)
          .addField("Facebook", res.facebook)
          .addField("Twitter", res.twitter)
          .addField("Players", `[${res.players[0].name}](https://www.hltv.org/stats/players/${res.players[0].id}/${res.players[0].name}), [${res.players[1].name}](https://www.hltv.org/stats/players/${res.players[1].id}/${res.players[1].name}), [${res.players[2].name}](https://www.hltv.org/stats/players/${res.players[2].id}/${res.players[2].name}), [${res.players[3].name}](https://www.hltv.org/stats/players/${res.players[3].id}/${res.players[3].name}), [${res.players[4].name}](https://www.hltv.org/stats/players/${res.players[4].id}/${res.players[4].name})`)
          .addField("Rank", res.rank);
          if(res.recentResults === undefined || res.recentResults.length == 0)
          {
            message.channel.send({embed});
          }
          else
          {
            for (var i = 0; i < res.recentResults.length; i++)
            {
              //console.log(res.recentResults[i]);
              if(i >= 20)
                return;

              if (res.recentResults[i].result != '-:-')
              {
                embed.addField("Recent Matches", `(${res.name} ${res.recentResults[i].result} ${res.recentResults[i].enemyTeam.name}) \n \t\t(${res.name} ${res.recentResults[i+1].result} ${res.recentResults[i+1].enemyTeam.name}) \n \t\t(${res.name} ${res.recentResults[i+2].result} ${res.recentResults[i+2].enemyTeam.name})`);
                message.channel.send({embed});
                return;
              }
            }
          }
        });
    }
    else if (args[0] == "stats")     // If stats after teamname display a team stats page
    {
      HLTV.getTeamStats({id: teamID}).then(res =>
        {
          //console.log(res);
          //console.log("\n\n\n ======================================================================== \n\n\n");
          const embed = new Discord.RichEmbed()
          .setTitle(teamName + " Stats")
          .setColor(0x00AE86)
          .setTimestamp()
          .setFooter("Sent by HLTVBot", client.user.avatarURL)
          .setURL(`https://www.hltv.org/stats/teams/${teamID}/${teamName}`)
          .addField("Maps Played", res.overview.mapsPlayed, true)
          .addField("Rounds Played", res.overview.roundsPlayed, true)
          .addField("Wins", res.overview.wins, true)
          .addField("Losses", res.overview.losses, true)
          .addField("Kills", res.overview.totalKills, true)
          .addField("Deaths", res.overview.totalDeaths, true)
          .addField("KD Ratio", res.overview.kdRatio, true)
          .addField("Average Kills Per Round", Math.round(res.overview.totalKills / res.overview.roundsPlayed * 100) / 100, true)
          .addField("Win%", Math.round(res.overview.wins / (res.overview.losses + res.overview.wins) * 10000) / 100, true)
          message.channel.send({embed});
        });
    }
    else if (args[0] == "maps")     // If maps after teamname display a team maps page
    {
      HLTV.getTeamStats({id: teamID}).then(res =>
        {
          // console.log(res);
          // console.log("\n\n\n\n");
          var currIndex = 0;
          var mapArr = [];
          var mapNameArr = [];
          var mapcount = 0;

          for (var mapKey in res.mapStats)
          {
            var map = res.mapStats[mapKey];
            mapArr[mapcount] = map;
            mapNameArr[mapcount] = mapKey;
            mapcount++;
          }

          var embed = handleMapPages(res, currIndex, teamName, teamID, mapArr, mapNameArr);
          var originalAuthor = message.author;
          message.channel.send({embed}).then((message) =>
          {
            message.react('⬅').then(() => message.react('⏹').then(() => message.react('➡')));

            const collector = new Discord.ReactionCollector(message, (reaction, user) => (Object.values(reactionControls).includes(reaction.emoji.name) && user.id == originalAuthor.id), {
              time: 60000, // stop automatically after one minute
            });

            collector.on('collect', (reaction, user) =>
            {
              switch (reaction.emoji.name)
              {
                case reactionControls.PREV_PAGE:
                {
                  if (currIndex - 3 >= 0)
                    currIndex-=3;
                  message.edit(handleMapPages(res, currIndex, teamName, teamID, mapArr, mapNameArr));
                  break;
                }
                case reactionControls.NEXT_PAGE:
                {
                  if (currIndex + 3 <= mapArr.length - 1)
                    currIndex+=3;
                  message.edit(handleMapPages(res, currIndex, teamName, teamID, mapArr, mapNameArr));
                  break;
                }
                case reactionControls.STOP:
                {
                  // stop listening for reactions
                  message.delete();
                  collector.stop();
                  break;
                }
              }
            });

            collector.on('stop', async () => {
                await message.clearReactions();
            });
          });
        });
    }
    else if (args[0] == "link")     // If link after teamname send a link to the team page
    {
      message.channel.send(`https://www.hltv.org/team/${teamID}/${teamName}`);
    }
    else  // Error catching for incorrect command
    {
      message.channel.send("Invalid Command, use .hltv for commands");
    }
    //message.channel.send(command);
  }

  if(command === "results")
  {
    HLTV.getResults({pages: 1}).then((res) =>
    {
      //console.log(res);
      var currIndex = 0;
      var embed = handlePages(res, currIndex, COMMANDCODE.RESULTS);
      var originalAuthor = message.author;
      message.channel.send({embed}).then((message) =>
      {
        message.react('⬅').then(() => message.react('⏹').then(() => message.react('➡')));

        const collector = new Discord.ReactionCollector(message, (reaction, user) => (Object.values(reactionControls).includes(reaction.emoji.name) && user.id == originalAuthor.id), {
          time: 60000, // stop automatically after one minute
        });

        collector.on('collect', (reaction, user) =>
        {
          switch (reaction.emoji.name)
          {
            case reactionControls.PREV_PAGE:
            {
              if (currIndex - 3 >= 0)
                currIndex-=3;
              message.edit(handlePages(res, currIndex, COMMANDCODE.RESULTS));
              break;
            }
            case reactionControls.NEXT_PAGE:
            {
              if (currIndex + 3 <= res.length)
                currIndex+=3;
              message.edit(handlePages(res, currIndex, COMMANDCODE.RESULTS));
              break;
            }
            case reactionControls.STOP:
            {
              // stop listening for reactions
              message.delete();
              collector.stop();
              break;
            }
          }
        });

        collector.on('stop', async () => {
            await message.clearReactions();
        });
      });
    });
  }

  if(command === "matches")
  {
    HLTV.getMatches().then((res) =>
    {
      //console.log(res);
      var currIndex = 0;
      var embed = handlePages(res, currIndex, COMMANDCODE.MATCHES);
      var originalAuthor = message.author;
      message.channel.send({embed}).then((message) =>
      {
        message.react('⬅').then(() => message.react('⏹').then(() => message.react('➡')));

        const collector = new Discord.ReactionCollector(message, (reaction, user) => (Object.values(reactionControls).includes(reaction.emoji.name) && user.id == originalAuthor.id), {
          time: 60000, // stop automatically after one minute
        });

        collector.on('collect', (reaction, user) =>
        {
          switch (reaction.emoji.name)
          {
            case reactionControls.PREV_PAGE:
            {
              if (currIndex - 3 >= 0)
                currIndex-=3;
              message.edit(handlePages(res, currIndex, COMMANDCODE.MATCHES));
              break;
            }
            case reactionControls.NEXT_PAGE:
            {
              if (currIndex + 3 <= res.length)
                currIndex+=3;
              message.edit(handlePages(res, currIndex, COMMANDCODE.MATCHES));
              break;
            }
            case reactionControls.STOP:
            {
              // stop listening for reactions
              message.delete();
              collector.stop();
              break;
            }
          }
        });

        collector.on('stop', async () => {
            await message.clearReactions();
        });
      });
    });
  }

  if(command === "livematches")
  {
    HLTV.getMatches().then((res) =>
    {
      var liveArr = [];
      var livecount = 0;

      for (var matchKey in res)
      {
        var match = res[matchKey];
        if (match.live == true)
        {
          liveArr[livecount] = match;
          livecount++;
        }
      }

      //console.log(res);
      var currIndex = 0;
      var embed = handlePages(res, currIndex, COMMANDCODE.LIVEMATCHES);
      var originalAuthor = message.author;
      message.channel.send({embed}).then((message) =>
      {
        message.react('⬅').then(() => message.react('⏹').then(() => message.react('➡')));

        const collector = new Discord.ReactionCollector(message, (reaction, user) => (Object.values(reactionControls).includes(reaction.emoji.name) && user.id == originalAuthor.id), {
          time: 60000, // stop automatically after one minute
        });

        collector.on('collect', (reaction, user) =>
        {
          switch (reaction.emoji.name)
          {
            case reactionControls.PREV_PAGE:
            {
              if (currIndex - 5 >= 0)
                currIndex-=5;
              message.edit(handlePages(liveArr, currIndex, COMMANDCODE.LIVEMATCHES));
              break;
            }
            case reactionControls.NEXT_PAGE:
            {
              if (currIndex + 5 <= liveArr.length)
                currIndex+=5;
              message.edit(handlePages(liveArr, currIndex, COMMANDCODE.LIVEMATCHES));
              break;
            }
            case reactionControls.STOP:
            {
              // stop listening for reactions
              message.delete();
              collector.stop();
              break;
            }
          }
        });

        collector.on('stop', async () => {
            await message.clearReactions();
        });
      });
    });
  }

  if(command === "events")
  {
    HLTV.getEvents().then((res) =>
    {
      //console.log(res);
      //console.log(res[0].events);
      var eventArray = res[0].events;
      var currIndex = 0;
      var embed = handleEventPages(eventArray, currIndex);
      var originalAuthor = message.author;
      message.channel.send({embed}).then((message) =>
      {
        message.react('⬅').then(() => message.react('⏹').then(() => message.react('➡')));

        const collector = new Discord.ReactionCollector(message, (reaction, user) => (Object.values(reactionControls).includes(reaction.emoji.name) && user.id == originalAuthor.id), {
          time: 60000, // stop automatically after one minute
        });

        collector.on('collect', (reaction, user) =>
        {
          switch (reaction.emoji.name)
          {
            case reactionControls.PREV_PAGE:
            {
              if (currIndex - 3 >= 0)
                currIndex-=3;
              message.edit(handleEventPages(eventArray, currIndex));
              break;
            }
            case reactionControls.NEXT_PAGE:
            {
              if (currIndex + 3 <= eventArray.length)
                currIndex+=3;
              message.edit(handleEventPages(eventArray, currIndex));
              break;
            }
            case reactionControls.STOP:
            {
              // stop listening for reactions
              message.delete();
              collector.stop();
              break;
            }
          }
        });

        collector.on('stop', async () => {
            await message.clearReactions();
        });
      })
    });
  }
});

client.login(process.env.BOT_TOKEN);