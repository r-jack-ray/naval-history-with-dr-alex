# Restream dual-output follow-up

Status: note only. Do not implement a generic orientation rule until the channel
has used Restream's paired horizontal and vertical YouTube output successfully
and the repository has a real pair to inspect.

If a future Restream session produces separate paired YouTube events, keep the
horizontal event and ignore the vertical event in full. Before automating that
decision, capture one completed pair and determine which saved channel or
official metadata reliably identifies the pairing and each orientation. Do not
infer the vertical event from matching titles or nearby timestamps alone
without that sample.

The erroneous setup streams `ts331iLYWlc` and `Ec-QeRtmPzw` are immediate,
explicit full-video exclusions in `src/channel/ignored-videos.json`. They are
not a working dual-output sample and do not trigger the deferred generic rule.
