import type { Meeting, Chunk, TranscriptLine, AgendaItem } from "./types"

const mockTranscript: TranscriptLine[] = [
  {
    id: "seg_672",
    startTime: 3778.58,
    endTime: 3778.887,
    text: "Ms.",
    speaker: "SPEAKER_06",
  },
  {
    id: "seg_673",
    startTime: 3778.949,
    endTime: 3780.034,
    text: "Dancer?",
    speaker: "SPEAKER_10",
  },
  {
    id: "seg_674",
    startTime: 3785.347,
    endTime: 3786.329,
    text: "Thank you, Commissioners.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_675",
    startTime: 3787.07,
    endTime: 3791.977,
    text: "I'd like to echo what Professor Carr said about extending the timeline.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_676",
    startTime: 3792.698,
    endTime: 3801.432,
    text: "Between now and the first of the year, it's unreasonable to ask people to dig into a document like this, you all or citizens.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_677",
    startTime: 3802.12,
    endTime: 3810.462,
    text: "Until about a week ago, I hadn't heard that this was going to be up for review, and I'm pretty sure nobody else in the community knows.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_678",
    startTime: 3811.665,
    endTime: 3817.159,
    text: "So there has been no time for community members even to be alerted about it.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_679",
    startTime: 3817.139,
    endTime: 3824.441,
    text: "As you may know, if you've looked at this document and compared it to the last one, the last one was 60-something pages long.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_680",
    startTime: 3824.482,
    endTime: 3826.568,
    text: "This is 202 pages, I think.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_681",
    startTime: 3827.31,
    endTime: 3831.182,
    text: "And there are chapters in this that were not even in the previous document.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_682",
    startTime: 3831.584,
    endTime: 3839.859,
    text: "It's a lot more complicated going from that document to this document, even for those of us who have been following it.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_683",
    startTime: 3839.939,
    endTime: 3843.085,
    text: "And I have to say, I find this kind of boring myself.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_684",
    startTime: 3843.185,
    endTime: 3844.868,
    text: "It's not like it's exciting to me.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_685",
    startTime: 3844.928,
    endTime: 3847.112,
    text: "I mean, the vision of the city is exciting.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_686",
    startTime: 3847.514,
    endTime: 3850.18,
    text: "But the document is just necessary.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_687",
    startTime: 3850.2,
    endTime: 3853.848,
    text: "It's what developers will use to make their case.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_688",
    startTime: 3853.928,
    endTime: 3857.476,
    text: "It's what neighbors will use to argue with developers.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_689",
    startTime: 3857.636,
    endTime: 3860.342,
    text: "It's the standard that you all will be held accountable",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_690",
    startTime: 3860.322,
    endTime: 3862.049,
    text: "informally and legally.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_691",
    startTime: 3862.109,
    endTime: 3864.88,
    text: "It's really important and it's important to get it right.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_692",
    startTime: 3864.92,
    endTime: 3869.86,
    text: "I want to echo that the reformatting has been fantastic.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_693",
    startTime: 3870.565,
    endTime: 3877.522,
    text: "I also want to point out that including indicators, which are data that you can test your success by are important.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_694",
    startTime: 3878.063,
    endTime: 3881.993,
    text: "What's still missing is data and analysis.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_695",
    startTime: 3881.973,
    endTime: 3887.965,
    text: "There is no way for you to know how you're doing now so that you can tell in five years if you're doing better or worse.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_696",
    startTime: 3888.506,
    endTime: 3894.779,
    text: "And that's going to take time to collect unless it just is still in some mysterious vault that we haven't seen.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_697",
    startTime: 3894.819,
    endTime: 3897.805,
    text: "And just to give you a few examples,",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_698",
    startTime: 3898.291,
    endTime: 3910.68,
    text: "There's no indication of the number of housing units or the types of housing units or their locations in the document So we don't know how much housing we have how much we've added of which types or where and",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_699",
    startTime: 3911.234,
    endTime: 3927.927,
    text: "One of the comments, and I just skimmed this this morning, so I would have probably 20 minutes of point-by-point discussion at least, but someone pointed out that there are neighborhoods on the east side that don't have sidewalks, and that is true.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_700",
    startTime: 3928.21,
    endTime: 3937.993,
    text: "There are also neighborhoods on the west side that don't have sidewalks because almost no neighborhood in Gainesville except the Duck Pond and the Southeast Historic District do have sidewalks.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_701",
    startTime: 3938.113,
    endTime: 3941.842,
    text: "But nobody knows that because that isn't in the data.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_702",
    startTime: 3941.922,
    endTime: 3944.548,
    text: "So if you're going to add sidewalks, how are you going to do it?",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_703",
    startTime: 3944.608,
    endTime: 3945.831,
    text: "How are you going to know?",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_704",
    startTime: 3945.811,
    endTime: 3948.114,
    text: "what you have now, and that's just one example.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_705",
    startTime: 3948.715,
    endTime: 3957.808,
    text: "There's no indication of the number of housing units or the types of housing units in this draft, it says that our population is 132,000, and our population, as you all know, is 145,000.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_706",
    startTime: 3958.068,
    endTime: 3964.157,
    text: "So there could be three errors like that per page times 200 pages, and nobody knows.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_707",
    startTime: 3965.538,
    endTime: 3982.922,
    text: "I would like to, without having talked to the board of Gainesville Neighborhood Voices, but I believe we would be willing to co-host like three chapter each meetings over a couple of weeks or months or whatever to give the public a chance to really talk through all of these things.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_708",
    startTime: 3982.902,
    endTime: 3991.689,
    text: "Because as Peggy says, the citizens are not getting a chance to provide input.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_709",
    startTime: 3991.709,
    endTime: 3995.781,
    text: "And sitting in the audience, what it sounds like is that the whole process",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_710",
    startTime: 3996.47,
    endTime: 3999.438,
    text: "I hate to say it this way, but is occurring out of the sunshine.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_711",
    startTime: 4007.742,
    endTime: 4018.224,
    text: "If it's just between commissioners and staff people and there's no way for us to hear what does Commissioner so-and-so say about it,",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_712",
    startTime: 4019.266,
    endTime: 4027.523,
    text: "That's really, really not fair and at least from my point of view to hear what you all say to each other and to the community all in one place would be extremely helpful.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_713",
    startTime: 4019.266,
    endTime: 4027.523,
    text: "And I just also would like to argue that everything that folks have concerns about have to do with",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_714",
    startTime: 4028.279,
    endTime: 4035.571,
    text: "how Gainesville is organized spatially, where there are jobs, where there are supermarkets, where there's such and such type of housing.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_715",
    startTime: 4036.072,
    endTime: 4043.605,
    text: "And to think about it as a set of words that aren't linked to spaces is...",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_716",
    startTime: 4044.648,
    endTime: 4053.46,
    text: "It just doesn't reconcile with the way any of us think of Gainesville, not just professionals like myself, but anyone who went to those earlier visioning sessions.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_717",
    startTime: 4054.013,
    endTime: 4056.661,
    text: "So I really hope you'll slow down.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_718",
    startTime: 4056.741,
    endTime: 4058.206,
    text: "I hope you'll keep it spatial.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_719",
    startTime: 4058.326,
    endTime: 4064.145,
    text: "Even if the map isn't changing, I think still to see and for everyone to see, oh, look at that.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_720",
    startTime: 4064.225,
    endTime: 4065.489,
    text: "There are no bus lines here.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_721",
    startTime: 4065.549,
    endTime: 4066.251,
    text: "Look at that.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_722",
    startTime: 4066.231,
    endTime: 4067.874,
    text: "There are no sidewalks here.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_723",
    startTime: 4067.914,
    endTime: 4068.455,
    text: "Look at that.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_724",
    startTime: 4068.475,
    endTime: 4070.119,
    text: "There are more parks here than here.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_725",
    startTime: 4070.179,
    endTime: 4072.904,
    text: "Those are important things to teach us all about.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_726",
    startTime: 4073.145,
    endTime: 4077.053,
    text: "And as I say, I think we would be happy to help with that.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_727",
    startTime: 4078.095,
    endTime: 4086.231,
    text: "And then finally, just as an individual, I would say that this is an incredibly ambitious plan if you try to meet all of those indicators.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_728",
    startTime: 4086.211,
    endTime: 4089.066,
    text: "You have a hardworking staff,",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_729",
    startTime: 4089.417,
    endTime: 4091.059,
    text: "It's really, really ambitious.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_730",
    startTime: 4091.2,
    endTime: 4092.702,
    text: "And so I hope you'll consider that too.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_731",
    startTime: 4092.922,
    endTime: 4094.524,
    text: "Thank you, and thanks for the extra time.",
    speaker: "SPEAKER_01",
  },
  {
    id: "seg_732",
    startTime: 4095.285,
    endTime: 4095.606,
    text: "Thank you.",
    speaker: "SPEAKER_10",
  },
  {
    id: "seg_733",
    startTime: 4095.906,
    endTime: 4097.208,
    text: "That was our last speaker, Mr. Mayor.",
    speaker: "SPEAKER_11",
  },
  {
    id: "seg_734",
    startTime: 4097.228,
    endTime: 4097.629,
    text: "OK, thank you.",
    speaker: "SPEAKER_10",
  },
  {
    id: "seg_735",
    startTime: 4097.669,
    endTime: 4102.696,
    text: "I would point out that we are actually closer to 150,000 people at this point than we are even 146.",
    speaker: "SPEAKER_10",
  },
  {
    id: "seg_736",
    startTime: 4102.896,
    endTime: 4105.56,
    text: "Can I ask Commissioner Testa if you want to do it?",
    speaker: "SPEAKER_10",
  },
  {
    id: "seg_737",
    startTime: 4105.58,
    endTime: 4106.221,
    text: "Yes, thank you.",
    speaker: "SPEAKER_11",
  },
  {
    id: "seg_738",
    startTime: 4107.082,
    endTime: 4108.624,
    text: "Thank you, Mr. Mayor.",
    speaker: "SPEAKER_04",
  },
  {
    id: "seg_739",
    startTime: 4108.857,
    endTime: 4121.485,
    text: "Mr. Manager, I'm looking at the community feedback sessions that we had previously with 500 participants at the listening session and then 50 at the conversation in a box.",
    speaker: "SPEAKER_04",
  },
  {
    id: "seg_740",
    startTime: 4122.267,
    endTime: 4128.3,
    text: "And I'm wondering if you could develop a schedule or something to come back and to",
    speaker: "SPEAKER_04",
  },
  {
    id: "seg_741",
    startTime: 4128.567,
    endTime: 4136.561,
    text: "show how we can have community engagement, citizen engagement in the process to get feedback.",
    speaker: "SPEAKER_04",
  },
  {
    id: "seg_742",
    startTime: 4137.202,
    endTime: 4144.315,
    text: "I like the idea of involving Gainesville Voices to assist in that process.",
    speaker: "SPEAKER_04",
  },
  {
    id: "seg_743",
    startTime: 4144.868,
    endTime: 4155.276,
    text: "Mr. Mayor, we can certainly have staff attend, whether it's Ms. Carr and Ms.",
    speaker: "SPEAKER_13",
  },
  {
    id: "seg_744",
    startTime: 4155.317,
    endTime: 4159.846,
    text: "Tanzer's group or any other community advocacy groups that are out there.",
    speaker: "SPEAKER_13",
  },
  {
    id: "seg_745",
    startTime: 4160.007,
    endTime: 4170.707,
    text: "Absolutely, if they want to reach out to our office, we can have staff come to a meeting to be able to",
    speaker: "SPEAKER_13",
  },
  {
    id: "seg_746",
    startTime: 4170.687,
    endTime: 4190.653,
    text: "answer questions and make sure everyone knows how to provide comments or what the schedule is going forward.",
    speaker: "SPEAKER_13",
  },
]

export const mockChunk: Chunk = {
  id: "chunk-4",
  meetingId: "meeting-1",
  title: "Commission and Staff Response: Public Engagement, Timeline, and Document Access",
  type: "discussion",
  startTime: 3778.58,
  endTime: 4190.653,
  agendaId: "agenda-2", // Link to agenda item
  summary: {
    text: "Commissioners and staff discussed concerns raised by citizens about the Imagine GNV comprehensive plan review timeline. Staff committed to attending community group meetings and clarified how residents can submit comments. The discussion addressed the need for better public engagement before the document moves forward.",
    keyDecisions: [
      "Staff will attend community advocacy group meetings upon request",
      "Public comment process to be clarified and communicated",
      "Consideration of timeline delay pending legislative session outcome",
    ],
    notableQuotes: [
      {
        speaker: "SPEAKER_01",
        quote:
          "Until about a week ago, I hadn't heard that this was going to be up for review, and I'm pretty sure nobody else in the community knows.",
        timestamp: 3802.12,
      },
      {
        speaker: "SPEAKER_01",
        quote:
          "It's what developers will use to make their case. It's what neighbors will use to argue with developers. It's the standard that you all will be held accountable informally and legally.",
        timestamp: 3850.2,
      },
    ],
  },
  transcript: mockTranscript,
}

export const mockAgenda: AgendaItem[] = [
  {
    id: "agenda-1",
    title: "Opening Business",
    order: 1,
    chunkIds: ["chunk-1", "chunk-2"],
  },
  {
    id: "agenda-2",
    title: "Imagine GNV Comprehensive Plan",
    order: 2,
    chunkIds: ["chunk-3", "chunk-4"],
  },
  {
    id: "agenda-3",
    title: "Closing Business",
    order: 3,
    chunkIds: ["chunk-5"],
  },
]

export const mockMeeting: Meeting = {
  id: "meeting-1",
  title: "General Policy Committee",
  date: "2025-11-13",
  type: "Committee Meeting",
  youtubeId: "BeLaq4JEvm8",
  summary:
    "The General Policy Committee met to discuss the Imagine GNV comprehensive plan update, community engagement processes, and development policies.",
  agenda: mockAgenda, // Add agenda to meeting
  chunks: [
    {
      ...mockChunk,
      id: "chunk-1",
      title: "Call to Order and Roll Call",
      type: "procedural",
      startTime: 0,
      endTime: 300,
      agendaId: "agenda-1",
    },
    {
      ...mockChunk,
      id: "chunk-2",
      title: "Approval of Minutes",
      type: "procedural",
      startTime: 300,
      endTime: 600,
      agendaId: "agenda-1",
    },
    {
      ...mockChunk,
      id: "chunk-3",
      title: "Public Comment Period",
      type: "public-comment",
      startTime: 600,
      endTime: 3778,
      agendaId: "agenda-2",
    },
    { ...mockChunk, agendaId: "agenda-2" },
    {
      ...mockChunk,
      id: "chunk-5",
      title: "Adjournment",
      type: "procedural",
      startTime: 4191,
      endTime: 4300,
      agendaId: "agenda-3",
    },
  ],
}

export function getMeeting(id: string): Meeting | null {
  if (id === "meeting-1") return mockMeeting
  return null
}

export const getMeetingById = getMeeting

export function getChunkById(chunkId: string): Chunk | null {
  const chunk = mockMeeting.chunks.find((c) => c.id === chunkId)
  return chunk || null
}

export function getChunkPosition(meetingId: string, chunkId: string): { currentIndex: number; totalChunks: number } {
  const meeting = getMeeting(meetingId)
  if (!meeting) return { currentIndex: 0, totalChunks: 0 }

  const index = meeting.chunks.findIndex((c) => c.id === chunkId)
  return {
    currentIndex: index + 1,
    totalChunks: meeting.chunks.length,
  }
}

export function getChunk(
  meetingId: string,
  chunkId: string,
): { chunk: Chunk; meeting: Meeting; chunkIndex: number; totalChunks: number } | null {
  const meeting = getMeeting(meetingId)
  if (!meeting) return null

  const chunkIndex = meeting.chunks.findIndex((c) => c.id === chunkId)
  if (chunkIndex === -1) return null

  return {
    chunk: meeting.chunks[chunkIndex],
    meeting,
    chunkIndex,
    totalChunks: meeting.chunks.length,
  }
}

export function getAdjacentChunks(meetingId: string, chunkId: string): { prev: Chunk | null; next: Chunk | null } {
  const meeting = getMeeting(meetingId)
  if (!meeting) return { prev: null, next: null }

  const index = meeting.chunks.findIndex((c) => c.id === chunkId)
  return {
    prev: index > 0 ? meeting.chunks[index - 1] : null,
    next: index < meeting.chunks.length - 1 ? meeting.chunks[index + 1] : null,
  }
}
