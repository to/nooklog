export default {
	'server': {
		'port': 3000,
	},
	'database': {
		'path': 'data/lancedb',
		'recentThresholdDays': 7,
		'optimization': {
			'maxSmallFragments': 100,
			'keepVersionsDays': 7,
		},
	},
};
