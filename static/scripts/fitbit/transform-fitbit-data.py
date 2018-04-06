import pandas as pd
import numpy as np
import arrow

# Import Data
file_in  = "marsland-fitbit-sleep-raw.csv"
file_out_csv = "marsland-fitbit-sleep.csv"
file_out_tsv = "marsland-fitbit-sleep.tsv"
file_out_dow_tsv = "marsland-fitbit-sleep-dow.tsv"
file_out_json = "marsland-fitbit-sleep.json"
df_sleep_raw = pd.read_csv(file_in)


# Datetime -> Date and Group
df_sleep_raw['date'] = df_sleep_raw['Start Time'].str.slice(0, 10)

df_sleep_raw['sleep_start_hour'] = df_sleep_raw['Start Time'].apply(lambda x: int(arrow.get(x, 'YYYY-MM-DD h:mm A').format('HH')) )
df_sleep_raw['sleep_start_minute'] = df_sleep_raw['Start Time'].apply(lambda x: int(arrow.get(x, 'YYYY-MM-DD h:mm A').format('mm')) )
df_sleep_raw['sleep_start_minutes'] = df_sleep_raw['sleep_start_hour'] * 60 + df_sleep_raw['sleep_start_minute']
df_sleep_raw['sleep_start_minutes'] = df_sleep_raw['sleep_start_minutes'].apply(lambda x: x if x >= 20*60 and x <= 1440 else x+1440)




print df_sleep_raw.head(10)
raise

df_sleep = pd.pivot_table(df_sleep_raw,
						  index="date",
						  values="Minutes Asleep")

df_sleep.rename(columns={'Minutes Asleep': 'asleep_mins'}, inplace=True)
df_sleep.reset_index(level=0, inplace=True)

# Week Start Date on Monday
df_sleep['week_date'] = df_sleep['date'].apply(lambda x: arrow.get(x, 'YYYY-MM-DD').shift(weekday=0).format('YYYY-MM-DD') )
df_sleep['dow'] = df_sleep['date'].apply(lambda x: arrow.get(x, 'YYYY-MM-DD').format('d-ddd') )
df_sleep['month_date'] = df_sleep['date'].apply(lambda x: arrow.get(x, 'YYYY-MM-DD').format('YYYY-MM-01') )
df_sleep['year'] = df_sleep['date'].apply(lambda x: arrow.get(x, 'YYYY-MM-DD').format('YYYY') )

df_sleep = df_sleep[df_sleep['year'] >='2017']

# --------------------------------------------------------
# Group by Week Date
df_sleep_agg = pd.pivot_table(df_sleep,
						  index="month_date",
						  values="asleep_mins")
	
# asleep_mins -> asleep_hours
df_sleep_agg['asleep_hours'] = df_sleep_agg['asleep_mins'].apply(lambda x: round(x / 60,1))
df_sleep_agg.reset_index(level=0, inplace=True)
df_sleep_agg['date'] = df_sleep_agg['month_date']

# To CSV and TSV
# df_sleep_agg.to_csv(file_out_csv, sep=',', index=False)
df_sleep_agg[['date','asleep_hours']].to_csv(file_out_tsv, sep='\t', index=False)

# To Json
# sleep_json = df_sleep_agg.to_json(orient='records')
# with open(file_out_json, 'w') as f:
#     f.write(sleep_json)

# --------------------------------------------------------


# --------------------------------------------------------
# Group by Week Date
df_sleep_dow = pd.pivot_table(df_sleep,
						  index="dow",
						  values="asleep_mins")

# asleep_mins -> asleep_hours
df_sleep_dow['asleep_hours'] = df_sleep_dow['asleep_mins'].apply(lambda x: round(x / 60,1))
df_sleep_dow.reset_index(level=0, inplace=True)

# To CSV and TSV
# df_sleep_agg.to_csv(file_out_csv, sep=',', index=False)
df_sleep_dow[['dow','asleep_hours']].to_csv(file_out_dow_tsv, sep='\t', index=False)


print df_sleep_agg.head(5)
print df_sleep_dow.head(7)