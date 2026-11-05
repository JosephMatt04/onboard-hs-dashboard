# Risk Assessment realistic hover footage

The premium dashboard supports photographic/video category backgrounds, with local CSS animated scenes as an offline fallback.

## Online source test (interface refresh; no installer)

The following clips are sourced from video pages on Pexels and use the Pexels License. Their **download endpoints** are currently used directly as remote media sources when each category is hovered. **Playback depends on network access and the provider permitting in-page video streaming.** These external links are not guaranteed streaming endpoints and should ultimately be replaced with approved, locally packaged WebM clips. No H&S employee records or attachments are uploaded by the video feature. The external media provider can still see a standard network request such as IP address when a video loads.

| Category | Source |
|---|---|
| All | https://www.pexels.com/video/warehouse-storage-with-worker-walking-38707991/ |
| Chemicals & COSHH | https://www.pexels.com/video/bubbling-red-liquid-in-a-flask-10187920/ |
| Electrical Safety | https://www.pexels.com/video/person-welding-metal-14459264/ |
| Fire & Emergency | https://www.pexels.com/video/intense-close-up-of-flickering-fire-flames-30796588/ |
| Manual Handling | https://www.pexels.com/video/man-lifting-boxes-inside-the-warehouse-4292580/ |
| Occupational Health | https://www.pexels.com/video/heartbeat-on-monitor-855944/ |
| Working at Height | https://www.pexels.com/video/low-angle-footage-of-a-construction-worker-securing-the-steel-scaffolding-on-the-building-exterior-3078521/ |
| Other | https://www.pexels.com/video/industrial-machinery-in-factory-setting-35451867/ |
| Plant & Equipment | https://www.pexels.com/video/close-up-of-gears-on-a-machine-in-a-factory-10040029/ |
| Workplace & Premises | https://www.pexels.com/video/two-women-walking-in-the-hall-of-a-building-while-having-a-conversation-3044904/ |
| Vehicles & Transport | https://www.pexels.com/video/a-truck-travelling-in-the-road-4356074/ |
| Uncategorised | same warehouse clip as All |
| User-created categories | generic industrial clip |

Pexels licensing guide: https://help.pexels.com/hc/en-us/articles/360042295174-What-is-the-license-of-the-photos-and-videos-on-Pexels

## Proper offline production solution

Install approved short silent clips under `onboard-hs-desktop-v4/app/assets/risk-videos/`, change `RISK_CATEGORY_VIDEO_FILES` to those relative paths and use WebM MIME type. This needs one desktop install to deliver **new binary video files**, because the instant refresh capability currently exchanges only HTML and not newly bundled media.

When footage fails to load, the category's animated CSS scene remains visible. Reduced-motion users receive the static background rather than moving video.
