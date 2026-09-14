#!/bin/bash

# Matrix rain restricted to a specific ASCII shape mask
trap "tput sgr0; tput cnorm; clear; exit" SIGINT SIGTERM

tput clear
tput civis
chars='01'
# Read the shape into a mask array
IFS='' read -r -d '' shape <<"EOF"
                                @%%C#@@@@@@%@@@
                            @#%@@@@@@@@@@@@@@@@@@#@
                     -%#@@@@@@@@@@@@@@@@@@@@@@@@@@#@
                 @%%@@@@#%#@@@@@@@@@@@@@@@@@@@@@=-*+++*
             @%%@@@@@%@#%*@%@@@%#@%@@@@@@@@@@@@@@@@@@@@#@-
         =%@@@%#%@@@%@#@%%@@@@@%@%@%@@@@@@@@%@@@%@@%@@%@:-+%%+==
      %@@@@@%#@@@@%@%@@@@@#@@@@%@@@@@%@@@#%@@%@#@@@%#@@@@#-%##-::+::
     #%@@@@@@@%@%@@@@%@@@@@@@@@@@@@#@@#@%%@@#@@@@@@%#@@%+##*##=::+::
   #@@#*#%@@%@#@@@@@@@%@@@%@@%@@@@%@@#@@@@@@@@@@@@#%@@#+%#*##:-:::+:=#
  @: -%#%#@@%#@@@@%@%@@@@@@@#@@%@%#@@@#@@@@@@@@@@@%@@%=-#%#+-:::::-@
  @%@#%+*#@@#%#@#%@@@@%@@@+@@@%@%@@@#%@@@#@@%@@@#@@@%+-:::%##=-###*#
 @%%@@%%* -%@@@@%@@#@@@@@%#@#%@@@@@@%@@%@#@@#@@@#@@@%*+::+##%#:-@@@#
 #: :#@%@# :%%@@@@@%@%#@@#@%@%@@@@#@%@@@#@@@#@@@#%@@%*##*:=%*-:%@*+
 -#%%#@# : == #%@@#@@%@@%#@%@@@%@@%@@@%@@@#@@%@%@@%##+-%#*:+#%@###:.-:
@@%@@@@*     -+*%#%@#@%@%@%@@@@@#@%@@%#%@@%@%@#%#%##%##::+*%@@@=-:::::.:::
 @@@@%@@:. ==%*#*#@@@@%@@@%@#%#@@@@@@@@@@%%@@%@%@@@@%@@%#-:*##*-::+::::::
 #@%@@@#% .-+##+*#%#@@%@@%@@@@@@@@#@@@@@@@@#@%@@%#@@@@@%+#=-##%-::++::
+%@%@@@@%#*#@@@%@@#@@@@%@@@@%@%@@@@#@%@@%@@@@@%@@#%#%@@%#+:#@%*##--+-:+..
+@@@@%@@@%#*#%@%#@#%#%#@@@@@@%@@%@@@@@@@@#@@@@@#%#@@#@@@%#+:--:*#@--:-:..
%@@@@%@@ +#@@%@%*@@%#@%@@#@%@@%#@%@@@%@@%@@%@%#@@%@@#@@%#+-:---:-**-:--:
@@#@@#-+* #%@@%@#%@%@%@%@@@@%@#%@@%@@@@@#%#%@%@@#@%@@@@%#+-::::-:::::..:..
@%#@@%%.# *%@@%@@@#@%@@%@@@%#@%@@@%@@#@@@%@@@%@%#@@@%@@%*::+-::::...:::::-
 %@#%#: @% -#%@@@@@@@%@@@%#@@%@#@@#@@#%@@@@#@%@#@@@%@@@@#::::-++-..::::-
  @@*##: % -:##%@@%@@@%@#@@%@@%@@#@%@@@@@@%@@#@@@#%@@@@@%+:::::++- ...:...
  @@#%#*  :%*##@%#@@%@@@@#@%@@@@#@@@%@@#%@@@%#%@@@@@@@@@@#::--*#-..---..-
  *@+*#%  #%@@%@%@@@@%@@%@@%@@#@@#@%@@%@@@@#%#@@@%#@@@@@@#:-*@@#-  -::+:.
  %*++-*  :%#@@%@%@%@@%@@%@@@@%@%@@@@@#@#@@@%@%@@%@@%@@%*:=%#*-..:##%
   #=* *   :#%@@#@%@@## %@@%#@#@@%@@@@%@#@%@#@@%@@%@##::=##+#=  .::
   %: :%@*    :%#%@%        :#%@@@#@@@@%@@@@@@:-:%%:        ::--   ::
    =  %@%#                    .+%#%@@@@+ #%@@%@#*               --%:  ::
     - #%#+                       +%%#=-%# :+%@*+                 *-:  .
       %@@%                         -+%%%#                       *-:-
       #%@:                         :=#@@@@@#                   +-:
       #%@=                         +%#%@@@%#                   #--
       @@%@                          +@@@@@@+                  -**:
       @%@%@                      +#@@%+ - @%@@:               *%=-
%-  :*@@%%-+#-+       -=  #%@@@@%@@@@#      %@@@@#%@%#:+*      -:*=:--%#:::
%=-%@%@# =#%@%@%@@%@@%@@%@@#@@@%@@@%@#       #@%@@%@%@%#+::*##-::*-:*:::+
+@%@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@:         +%@@@@@%@@@%#@@##*=::###:-:
@%@@@@@@@%@@%#@%@#%#%@@@@@@@@#@%@@@@@         #@%@%#@%@@@@@@@@###=::++:=:
  @@+%@@@@@@%## #@%#=       #%@%+@%@:          @%@%@@%@+-     -#*++::+--:
     -%@@@%@%#----==%#=  %@@@@@                #@@@@#+ -=::::##+-::-:-
      @%@@%--:        -+#%@@@@@                +@@@@%@%+-   . -=#:::
                         -#@@@@@@@+  =.      @%@@@%@@%#::+-
                           %@#@@@%            ## %@@@@#*=-:.
                           #-%@@@@@%@@@@@@@@%@@@#+%@%+=-:.
                           ##+%@%@%@%@@@@@@@@@@%#-#+*=:-
                           #%@%@@@@@@@@@@@@@#%@@+*#:*=-.
                           %:%::%-%=++*@%#@@%@#@@%@#+#=:-:-.
                           %#-%% :-%%%:= @@% %@@ -=+ +%:-.
                            #%-#@@=- %@#  -@# - %@@ -%:: :
                               :%#*-:%@@@-=%%@-  %%.
                                  =-..  :+-+
EOF

declare -a mask
while IFS= read -r line; do
    mask+=("$line")
done <<< "$shape"

mask_h=${#mask[@]}
mask_w=0
for row in "${mask[@]}"; do
    if (( ${#row} > mask_w )); then mask_w=${#row}; fi
done

declare -a positions
declare -a lengths

update_size() {
    cols=$(tput cols)
    lines=$(tput lines)
    # Center the shape on the screen
    offset_x=$(( (cols - mask_w) / 2 ))
    offset_y=$(( (lines - mask_h) / 2 ))
    if (( offset_x < 0 )); then offset_x=0; fi
    if (( offset_y < 0 )); then offset_y=0; fi
    
    for ((i=1; i<=cols; i++)); do
        if [[ -z "${positions[$i]}" ]]; then
            positions[$i]=$((RANDOM % lines))
            lengths[$i]=$((RANDOM % lines + 5))
        fi
    done
    tput clear
}

trap update_size SIGWINCH
update_size

while true; do
    # Only iterate columns that overlap the mask to save rendering time
    for ((i=offset_x+1; i<=offset_x+mask_w; i++)); do
        pos=${positions[$i]}
        len=${lengths[$i]}
        
        mask_col=$(( i - offset_x - 1 )) 
        
        # 1. Print white head
        if (( pos >= 1 && pos <= lines )); then
            mask_row=$(( pos - offset_y - 1 ))
            if (( mask_row >= 0 && mask_row < mask_h )); then
                row_str="${mask[$mask_row]}"
                if (( mask_col < ${#row_str} )); then
                    mask_char="${row_str:$mask_col:1}"
                    if [[ "$mask_char" != " " && "$mask_char" != "" ]]; then
                        char="${chars:RANDOM%${#chars}:1}"
                        printf "\033[%s;%sH\033[1;37m%s" "$pos" "$i" "$char"
                    fi
                fi
            fi
        fi
        
        # 2. Print green body behind head
        body_pos=$((pos - 1))
        if (( body_pos >= 1 && body_pos <= lines )); then
            mask_row=$(( body_pos - offset_y - 1 ))
            if (( mask_row >= 0 && mask_row < mask_h )); then
                row_str="${mask[$mask_row]}"
                if (( mask_col < ${#row_str} )); then
                    mask_char="${row_str:$mask_col:1}"
                    if [[ "$mask_char" != " " && "$mask_char" != "" ]]; then
                        char="${chars:RANDOM%${#chars}:1}"
                        printf "\033[%s;%sH\033[0;32m%s" "$body_pos" "$i" "$char"
                    fi
                fi
            fi
        fi
        
        # 3. Erase tail
        tail_pos=$((pos - len))
        if (( tail_pos >= 1 && tail_pos <= lines )); then
            mask_row=$(( tail_pos - offset_y - 1 ))
            if (( mask_row >= 0 && mask_row < mask_h )); then
                row_str="${mask[$mask_row]}"
                if (( mask_col < ${#row_str} )); then
                    mask_char="${row_str:$mask_col:1}"
                    if [[ "$mask_char" != " " && "$mask_char" != "" ]]; then
                        printf "\033[%s;%sH " "$tail_pos" "$i"
                    fi
                fi
            fi
        fi
        
        # Update column drop position
        ((positions[$i]++))
        
        if (( positions[$i] > lines + len )); then
            positions[$i]=0
            lengths[$i]=$((RANDOM % lines + 5))
        fi
    done
    sleep 0.06
done
